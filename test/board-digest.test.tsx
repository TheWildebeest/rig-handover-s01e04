import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

const mockReadNight = vi.hoisted(() => vi.fn(async (runsDir: string, night: string) => {
  if (night === '2026-10-29') {
    const error = new Error('missing night');
    Object.assign(error, { code: 'ENOENT' });
    throw error;
  }

  const file = join(runsDir, `${night}.jsonl`);
  const contents = await require('node:fs').readFileSync(file, 'utf8');
  if (!contents.trim()) {
    return { rows: [], badLines: 0 };
  }

  return {
    rows: contents
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .map((entry) => ({
        job: entry.job,
        owner: entry.owner ?? null,
        runs: 1,
        retries: entry.status === 'retry' ? 1 : 0,
        lastStatus: entry.status,
        lastError: entry.error ?? null,
        firstAt: entry.at,
        lastAt: entry.at,
      }))
      .reduce((acc, row) => {
        const current = acc.get(row.job) ?? { ...row, runs: 0, retries: 0 };
        current.runs += 1;
        current.retries += row.retries;
        current.lastStatus = row.lastStatus;
        current.lastError = row.lastError;
        current.lastAt = row.lastAt;
        acc.set(row.job, current);
        return acc;
      }, new Map<string, any>())
      .values(),
    badLines: 0,
  };
}));

vi.mock('../src/digest/read.js', () => ({ readNight: mockReadNight }));

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board digest links', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it('links each night on disk to a digest and shows ok / retry / fail counts', async () => {
    const runsDir = join(tmpdir(), `rig-board-${Date.now()}`);
    tempDirs.push(runsDir);
    mkdirSync(runsDir, { recursive: true });

    writeFileSync(
      join(runsDir, '2026-10-27.jsonl'),
      [
        JSON.stringify({ at: '2026-10-27T08:00:00+01:00', job: 'alpha', status: 'ok', owner: 'rook' }),
        JSON.stringify({ at: '2026-10-27T08:10:00+01:00', job: 'beta', status: 'retry', owner: 'rook', error: 'upstream 503' }),
        JSON.stringify({ at: '2026-10-27T08:15:00+01:00', job: 'beta', status: 'fail', owner: 'rook', error: 'upstream 503' }),
      ].join('\n'),
    );

    writeFileSync(
      join(runsDir, '2026-10-28.jsonl'),
      [
        JSON.stringify({ at: '2026-10-28T09:00:00+01:00', job: 'gamma', status: 'ok', owner: 'lodz' }),
        JSON.stringify({ at: '2026-10-28T09:05:00+01:00', job: 'delta', status: 'ok', owner: 'rook' }),
        JSON.stringify({ at: '2026-10-28T09:10:00+01:00', job: 'epsilon', status: 'retry', owner: 'rook', error: 'retry' }),
        JSON.stringify({ at: '2026-10-28T09:20:00+01:00', job: 'zeta', status: 'fail', owner: 'rook', error: 'boom' }),
      ].join('\n'),
    );

    const res = await createApp({ ...config, runsDir }).request('/');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('<a href="/digest/2026-10-27">2026-10-27</a>');
    expect(html).toContain('(1 ok / 0 retry / 1 fail)');
    expect(html).toContain('<a href="/digest/2026-10-28">2026-10-28</a>');
    expect(html).toContain('(2 ok / 1 retry / 1 fail)');
  });

  it('renders — for counts when a night cannot be read', async () => {
    const runsDir = join(tmpdir(), `rig-board-missing-${Date.now()}`);
    tempDirs.push(runsDir);
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(join(runsDir, '2026-10-29.jsonl'), '');
    writeFileSync(join(runsDir, '2026-10-30.jsonl'), '');

    const res = await createApp({ ...config, runsDir }).request('/');
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('<a href="/digest/2026-10-29">2026-10-29</a>');
    expect(html).toContain('(— ok / — retry / — fail)');
    expect(html).toContain('<a href="/digest/2026-10-30">2026-10-30</a>');
  });
});
