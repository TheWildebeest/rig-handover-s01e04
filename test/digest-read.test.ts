import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

// The real nights are read-only fixtures. Every other case writes its own file in a temp dir.
const realRuns = fileURLToPath(new URL('../runs', import.meta.url));

describe('readNight on runs/2026-10-28.jsonl', () => {
  it('returns 5 jobs and counts the 1 bad line', async () => {
    const night = await readNight(realRuns, '2026-10-28');
    expect(night.badLines).toBe(1);
    expect(night.rows).toEqual([
      // owner null: the row stays and the owner stays null; a view shows it as —
      { job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00' },
      { job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503', firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00' },
      { job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held', firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00' },
      { job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'fail', lastError: 'quota exceeded', firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00' },
      { job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok', lastError: null, firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00' },
    ]);
  });
});

describe('readNight on other input', () => {
  let base: string;
  let runs: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'rig-digest-'));
    runs = join(base, 'runs');
    await mkdir(runs);
  });
  afterEach(() => rm(base, { recursive: true, force: true }));

  const read = async (lines: string[]) => {
    await writeFile(join(runs, 'night.jsonl'), lines.join('\n'));
    return readNight(runs, 'night');
  };
  const line = (fields: string) => `{"at":"2026-10-28T23:00:00+01:00","job":"a","status":"ok",${fields}}`;

  it('counts every line that does not parse, never throws, and ignores blank lines', async () => {
    const night = await read([
      line('"owner":"rook"'),
      '{"at":"2026-10-28T23:01:00+01:00","job":"b","sta', // cut off
      'not json',
      '[]',
      'null',
      '42',
      '{"at":"2026-10-28T23:02:00+01:00","job":"c","status":"boom","owner":null}', // unknown status
      '{"at":"yesterday","job":"d","status":"ok","owner":null}', // no usable time
      '{"at":"2026-10-28T23:03:00+01:00","status":"ok","owner":null}', // no job
      '',
      line('"owner":"rook"'),
      '',
    ]);
    expect(night.badLines).toBe(8);
    expect(night.rows.map((r) => [r.job, r.runs])).toEqual([['a', 2]]);
  });

  it('keeps a job whose owner is null, missing or blank; a later null does not erase an owner', async () => {
    const night = await read([
      '{"at":"2026-10-28T23:00:00+01:00","job":"a","status":"ok","owner":null}',
      '{"at":"2026-10-28T23:00:00+01:00","job":"b","status":"ok"}',
      '{"at":"2026-10-28T23:00:00+01:00","job":"c","status":"ok","owner":" "}',
      // a null owner on the last line does not erase an owner logged earlier
      '{"at":"2026-10-28T23:00:00+01:00","job":"d","status":"ok","owner":"rook"}',
      '{"at":"2026-10-28T23:05:00+01:00","job":"d","status":"ok","owner":null}',
    ]);
    expect(night.badLines).toBe(0);
    expect(night.rows.map((r) => [r.job, r.owner])).toEqual([['a', null], ['b', null], ['c', null], ['d', 'rook']]);
  });

  it('takes first and last by instant, not by file order or by the text of the time', async () => {
    // The clocks go back in the small hours: 02:50+02:00 is 00:50Z, 02:10+01:00 is 01:10Z.
    const night = await read([
      '{"at":"2026-10-25T02:10:00+01:00","job":"a","status":"fail","owner":"rook","error":"late"}',
      '{"at":"2026-10-25T02:50:00+02:00","job":"a","status":"ok","owner":"rook"}',
    ]);
    expect(night.rows).toEqual([
      { job: 'a', owner: 'rook', runs: 2, retries: 0, lastStatus: 'fail', lastError: 'late', firstAt: '2026-10-25T02:50:00+02:00', lastAt: '2026-10-25T02:10:00+01:00' },
    ]);
  });

  it('reads an empty file as a night with no rows and no bad lines', async () => {
    expect(await read([])).toEqual({ rows: [], badLines: 0 });
  });

  it('rejects with ENOENT for a night with no file, and for a name that is a path', async () => {
    await writeFile(join(base, 'outside.jsonl'), line('"owner":null'));
    await expect(readNight(runs, '2026-01-01')).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readNight(runs, '../outside')).rejects.toThrow('plain name');
  });
});
