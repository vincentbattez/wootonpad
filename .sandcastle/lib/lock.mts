// One run per repo at a time.
//
// A run that overruns its window meets the next cron on the same branches,
// the same refs and the same worktrees. The lock is a PID file: a live holder
// means "someone is here", a dead one is stale and taken over. It is one of
// the few pieces of state that is not git-shaped and is never read to decide
// what work to redo (ADR 0012).

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface LockHolder {
  pid: number;
  startedAt: string;
}

export interface LockOptions {
  path: string;
  pid?: number;
  /** Whether a process is still running — injected so a test can fake it. */
  isAlive?: (pid: number) => boolean;
  now?: () => Date;
}

const processIsAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    return (cause as NodeJS.ErrnoException).code === "EPERM";
  }
};

export function createLock(options: LockOptions) {
  const {
    path,
    pid = process.pid,
    isAlive = processIsAlive,
    now = () => new Date(),
  } = options;

  const read = (): LockHolder | null => {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as LockHolder;
    } catch {
      return null;
    }
  };

  /** The live holder when the lock is taken, null when this process now holds it. */
  const acquire = (): LockHolder | null => {
    const holder = read();
    if (holder && holder.pid !== pid && isAlive(holder.pid)) return holder;

    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({ pid, startedAt: now().toISOString() } satisfies LockHolder),
    );
    return null;
  };

  /** Only the holder releases; a stale file from another process is left to `acquire`. */
  const release = (): void => {
    if (read()?.pid === pid) rmSync(path, { force: true });
  };

  return { acquire, release, read };
}
