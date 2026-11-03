import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('digest JSON API', () => {
  let base: string;
  let runs: string;

  beforeEach(async () => {
    base = await mkdtemp(join(tmpdir(), 'rig-digest-json-'));
    runs = join(base, 'runs');
    await mkdir(runs, { recursive: true });
  });

  afterEach(async () => {
    await rm(base, { recursive: true, force: true });
  });

  it('returns rows and badLines from the shared readNight data', async () => {
    await writeFile(
      join(runs, 'night.jsonl'),
      [
        '{"at":"2026-10-28T23:00:00+01:00","job":"a","status":"retry","owner":"rook","error":"still failing"}',
        '{"at":"2026-10-28T23:05:00+01:00","job":"a","status":"ok","owner":null,"error":"done"}',
        '{"at":"2026-10-28T23:00:00+01:00","job":"b","status":"fail","owner":"lane-07","error":"quota exceeded"}',
        'not json',
      ].join('\n'),
    );

    const app = createApp({ ...config, runsDir: runs });
    const res = await app.request('/api/digest/night');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      rows: [
        {
          job: 'a',
          owner: 'rook',
          runs: 2,
          retries: 1,
          lastStatus: 'ok',
          lastError: 'done',
          firstAt: '2026-10-28T23:00:00+01:00',
          lastAt: '2026-10-28T23:05:00+01:00',
        },
        {
          job: 'b',
          owner: 'lane-07',
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: 'quota exceeded',
          firstAt: '2026-10-28T23:00:00+01:00',
          lastAt: '2026-10-28T23:00:00+01:00',
        },
      ],
      badLines: 1,
    });
  });

  it('returns a 404 JSON payload for a missing night', async () => {
    const app = createApp({ ...config, runsDir: runs });
    const res = await app.request('/api/digest/does-not-exist');

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'night not found: does-not-exist' });
  });
});
