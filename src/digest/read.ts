import { readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { DigestRow, DigestStatus, Night } from './types.js';

// One usable line of the log. `time` only orders lines; `at` keeps the offset the log wrote.
type Entry = {
  at: string;
  time: number;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error: string | null;
};

function isStatus(value: unknown): value is DigestStatus {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

// Text that is really there. A missing, blank or non-string value is null, never an empty cell.
function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

// Parse at the edge: a line becomes an Entry, or null when it is not a usable log line.
function parseLine(line: string): Entry | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const { at, job, status, owner, error } = raw as Record<string, unknown>;
  if (typeof at !== 'string') return null;
  const time = Date.parse(at);
  const name = text(job);
  if (Number.isNaN(time) || name === null || !isStatus(status)) return null;
  return { at, time, job: name, status, owner: text(owner), error: text(error) };
}

/**
 * Reads runs/<night>.jsonl into one row per job, sorted by job.
 *
 * - `runs` counts the job's lines; `retries` counts the ones with status `retry`.
 * - `firstAt`, `lastAt` and `lastStatus` come from the job's earliest and latest line by instant,
 *   not by file order. The times keep the offset from the log.
 * - `lastError` is the latest error the job logged, even if it ended `ok`. `owner` is the latest
 *   owner the job logged. Both are null when the log never gave one.
 * - A line that is not JSON, or has no usable `at`, `job` or `status`, adds to `badLines` and is
 *   skipped. It never throws. Blank lines are not lines.
 * - A night with no file rejects with the file system's ENOENT, so a route can answer 404.
 *   `night` must be a plain name such as 2026-10-28; anything with a path in it rejects.
 */
export async function readNight(runsDir: string, night: string): Promise<Night> {
  if (basename(night) !== night) {
    throw new Error(`night must be a plain name like 2026-10-28, got "${night}"`);
  }
  const file = await readFile(join(runsDir, `${night}.jsonl`), 'utf8');

  const entries: Entry[] = [];
  let badLines = 0;
  for (const line of file.split('\n')) {
    if (line.trim() === '') continue;
    const entry = parseLine(line);
    if (entry) entries.push(entry);
    else badLines += 1;
  }

  // Oldest first. The sort is stable, so two lines at the same instant keep their file order.
  entries.sort((a, b) => a.time - b.time);

  const rows = new Map<string, DigestRow>();
  for (const e of entries) {
    const row: DigestRow = rows.get(e.job) ?? {
      job: e.job,
      owner: null,
      runs: 0,
      retries: 0,
      lastStatus: e.status,
      lastError: null,
      firstAt: e.at,
      lastAt: e.at,
    };
    row.runs += 1;
    if (e.status === 'retry') row.retries += 1;
    row.owner = e.owner ?? row.owner;
    row.lastStatus = e.status;
    row.lastError = e.error ?? row.lastError;
    row.lastAt = e.at;
    rows.set(e.job, row);
  }

  const sorted = [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { rows: sorted, badLines };
}
