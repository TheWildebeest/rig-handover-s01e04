import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

const created: string[] = [];

afterEach(async () => {
  await Promise.all(created.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeRunsDir() {
  const base = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
  const runs = join(base, 'runs');
  await mkdir(runs, { recursive: true });
  created.push(base);
  return { base, runs };
}

async function writeNight(runsDir: string, night: string, lines: string[]) {
  await writeFile(join(runsDir, `${night}.jsonl`), lines.join('\n'));
}

describe('digest routes', () => {
  it('returns 200 and the same jobs in the same order for the page and JSON', async () => {
    const { runs } = await makeRunsDir();
    await writeNight(runs, 'night', [
      '{"at":"2026-10-28T23:00:00+01:00","job":"bravo","status":"retry","owner":"lane-07","error":"still failing"}',
      '{"at":"2026-10-28T23:05:00+01:00","job":"alpha","status":"ok","owner":"rook","error":null}',
      '{"at":"2026-10-28T23:10:00+01:00","job":"charlie","status":"fail","owner":"lane-03","error":"quota exceeded"}',
    ]);

    const app = createApp({ ...config, runsDir: runs });

    const pageRes = await app.request('/digest/night');
    const pageHtml = await pageRes.text();
    expect(pageRes.status).toBe(200);
    expect(pageHtml).toContain('digest · night');

    const jsonRes = await app.request('/api/digest/night');
    const json = (await jsonRes.json()) as { rows: Array<{ job: string }> };
    expect(jsonRes.status).toBe(200);

    const jsonJobs = json.rows.map((row) => row.job);
    expect(jsonJobs).toEqual(['alpha', 'bravo', 'charlie']);
    expect(pageHtml.indexOf('alpha')).toBeLessThan(pageHtml.indexOf('bravo'));
    expect(pageHtml.indexOf('bravo')).toBeLessThan(pageHtml.indexOf('charlie'));
    expect(pageHtml).toContain('alpha');
    expect(pageHtml).toContain('bravo');
    expect(pageHtml).toContain('charlie');
    const pageJobs = ['alpha', 'bravo', 'charlie']
      .map((job) => ({ job, index: pageHtml.indexOf(job) }))
      .filter((entry) => entry.index >= 0)
      .map((entry) => entry.job);
    expect(pageJobs).toEqual(jsonJobs);
  });

  it('returns 404 for a missing night on both routes', async () => {
    const { runs } = await makeRunsDir();
    const app = createApp({ ...config, runsDir: runs });

    const pageRes = await app.request('/digest/does-not-exist');
    const jsonRes = await app.request('/api/digest/does-not-exist');

    expect(pageRes.status).toBe(404);
    expect(jsonRes.status).toBe(404);
    expect(await jsonRes.json()).toEqual({ error: 'night not found: does-not-exist' });
  });

  it('renders "nothing ran" for an empty file and returns no rows in JSON', async () => {
    const { runs } = await makeRunsDir();
    await writeNight(runs, 'empty', []);

    const app = createApp({ ...config, runsDir: runs });
    const pageRes = await app.request('/digest/empty');
    const html = await pageRes.text();
    const jsonRes = await app.request('/api/digest/empty');
    const json = (await jsonRes.json()) as { rows: unknown[]; badLines: number };

    expect(pageRes.status).toBe(200);
    expect(html).toContain('nothing ran');
    expect(jsonRes.status).toBe(200);
    expect(json.rows).toEqual([]);
    expect(json.badLines).toBe(0);
  });

  it('keeps rendering the page and counts bad lines on JSON when a line is malformed', async () => {
    const { runs } = await makeRunsDir();
    await writeNight(runs, 'bad-line', [
      '{"at":"2026-10-28T23:00:00+01:00","job":"bravo","status":"ok","owner":"lane-07","error":null}',
      'not json',
      '{"at":"2026-10-28T23:05:00+01:00","job":"alpha","status":"retry","owner":"rook","error":"still failing"}',
    ]);

    const app = createApp({ ...config, runsDir: runs });

    const pageRes = await app.request('/digest/bad-line');
    const html = await pageRes.text();
    const jsonRes = await app.request('/api/digest/bad-line');
    const json = (await jsonRes.json()) as { rows: Array<{ job: string }>; badLines: number };

    expect(pageRes.status).toBe(200);
    expect(html).toContain('digest · bad-line');
    expect(html).toContain('alpha');
    expect(html).toContain('bravo');
    expect(jsonRes.status).toBe(200);
    expect(json.badLines).toBe(1);
    expect(json.rows.map((row) => row.job)).toEqual(['alpha', 'bravo']);
    const pageJobs = ['alpha', 'bravo'].map((job) => ({ job, index: html.indexOf(job) })).filter((entry) => entry.index >= 0).map((entry) => entry.job);
    expect(pageJobs).toEqual(json.rows.map((row) => row.job));
  });
});
