import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { lastBeat, type Beat } from './heartbeat.js';
import { readNight } from './digest/read.js';

export type NightCounts = {
  ok: number | null;
  retry: number | null;
  fail: number | null;
};

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: string[];
  digestCounts: Record<string, NightCounts>;
};

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export async function readStatus(config: RigConfig): Promise<Status> {
  const nights = nightsOnDisk(config.runsDir);
  const digestCounts: Record<string, NightCounts> = {};

  for (const night of nights) {
    try {
      const { rows } = await readNight(config.runsDir, night);
      const statusCounts: NightCounts = { ok: 0, retry: 0, fail: 0 };
      for (const row of rows) {
        if (row.lastStatus === 'ok') statusCounts.ok = (statusCounts.ok ?? 0) + 1;
        else if (row.lastStatus === 'retry') statusCounts.retry = (statusCounts.retry ?? 0) + 1;
        else if (row.lastStatus === 'fail') statusCounts.fail = (statusCounts.fail ?? 0) + 1;
      }
      digestCounts[night] = statusCounts;
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
        digestCounts[night] = { ok: null, retry: null, fail: null };
        continue;
      }
      throw error;
    }
  }

  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights,
    digestCounts,
  };
}
