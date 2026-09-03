// What happened, for a human and for the next run's optimisations.
//
// Everything a resume *needs* is in git (ADR 0012). The journal under
// `.sandcastle/state/` is derived: outcomes, durations, token usage, and the
// session an interrupted agent was in the middle of — which is the one thing
// worth caching, since it lets the agent keep its reasoning rather than just
// its diff. Deleting the directory costs visibility and a warmer restart,
// never correctness.
//
// The pause file is the exception that proves the rule: it is not about what
// work to redo, only about *when* to try again.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  appendFileSync,
} from "node:fs";
import { join } from "node:path";

export interface LeafRecord {
  leafId: string;
  rootId: string;
  outcome: string;
  at: string;
  durationMs: number;
  /** The implementer's last session, when the runner captured one. */
  sessionId?: string;
  sessionFilePath?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
    cacheCreationInputTokens: number;
  };
}

export interface RunRecord {
  startedAt: string;
  endedAt: string;
  roots: { id: string; pullRequest: string | null; outcome: string }[];
  interrupted?: string;
}

export interface Pause {
  until: string;
  reason: string;
}

export function createJournal(dir: string) {
  const leavesDir = join(dir, "leaves");
  const pauseFile = join(dir, "paused.json");
  const runsFile = join(dir, "runs.jsonl");

  const leafFile = (leafId: string) => join(leavesDir, `${leafId}.json`);

  const readJson = <T,>(path: string): T | null => {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as T;
    } catch {
      return null;
    }
  };

  const recordLeaf = (record: LeafRecord): void => {
    mkdirSync(leavesDir, { recursive: true });
    writeFileSync(leafFile(record.leafId), JSON.stringify(record, null, 2));
  };

  const lastLeaf = (leafId: string): LeafRecord | null =>
    readJson<LeafRecord>(leafFile(leafId));

  /**
   * The session an earlier attempt at this leaf left behind, when its JSONL
   * is still on the host. A purged file is not an error — it is the case the
   * cold re-prompt exists for.
   */
  const resumableSession = (leafId: string): string | null => {
    const record = lastLeaf(leafId);
    if (!record?.sessionId || !record.sessionFilePath) return null;
    return existsSync(record.sessionFilePath) ? record.sessionId : null;
  };

  const forgetSession = (leafId: string): void => {
    const record = lastLeaf(leafId);
    if (!record) return;
    const { sessionId: _s, sessionFilePath: _p, ...rest } = record;
    recordLeaf(rest);
  };

  const recordRun = (record: RunRecord): void => {
    mkdirSync(dir, { recursive: true });
    appendFileSync(runsFile, `${JSON.stringify(record)}\n`);
  };

  const pauseUntil = (until: Date, reason: string): void => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      pauseFile,
      JSON.stringify({ until: until.toISOString(), reason } satisfies Pause),
    );
  };

  /** The pause still in force at `now`, if any; an expired one is cleared. */
  const activePause = (now: Date = new Date()): Pause | null => {
    const pause = readJson<Pause>(pauseFile);
    if (!pause) return null;
    if (new Date(pause.until) > now) return pause;
    rmSync(pauseFile, { force: true });
    return null;
  };

  const leafRecords = (): LeafRecord[] => {
    if (!existsSync(leavesDir)) return [];
    return readdirSync(leavesDir)
      .map((name) => readJson<LeafRecord>(join(leavesDir, name)))
      .filter((record): record is LeafRecord => record !== null);
  };

  return {
    recordLeaf,
    lastLeaf,
    leafRecords,
    resumableSession,
    forgetSession,
    recordRun,
    pauseUntil,
    activePause,
  };
}

export type Journal = ReturnType<typeof createJournal>;
