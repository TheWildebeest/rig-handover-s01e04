export type DigestStatus = "ok" | "retry" | "fail";

export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: DigestStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

export type Night = {
  rows: DigestRow[];
  badLines: number;
};

/** Reads runs/<night>.jsonl. Lines that do not parse are counted in badLines, never thrown. */
export declare function readNight(runsDir: string, night: string): Promise<Night>;
