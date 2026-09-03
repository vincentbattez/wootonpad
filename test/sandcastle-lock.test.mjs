// Two runs on one repo share branches, refs and worktrees. The lock is what
// keeps a cron tick from landing on a run that overran its window.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLock } from "../.sandcastle/lib/lock.mts";
import { createJournal } from "../.sandcastle/lib/journal.mts";

async function scratch() {
  const dir = await mkdtemp(join(tmpdir(), "sandcastle-lock-"));
  return { dir, [Symbol.asyncDispose]: () => rm(dir, { recursive: true, force: true }) };
}

test("lock: a live holder keeps a second run out", async () => {
  await using s = await scratch();
  const path = join(s.dir, "lock");
  const alive = new Set([100]);
  const isAlive = (pid) => alive.has(pid);

  const first = createLock({ path, pid: 100, isAlive });
  const second = createLock({ path, pid: 200, isAlive });

  assert.equal(first.acquire(), null);
  assert.equal(second.acquire()?.pid, 100);
});

test("lock: a dead holder is stale and taken over", async () => {
  await using s = await scratch();
  const path = join(s.dir, "lock");
  const isAlive = () => false;

  createLock({ path, pid: 100, isAlive }).acquire();
  const second = createLock({ path, pid: 200, isAlive });

  assert.equal(second.acquire(), null);
  assert.equal(second.read()?.pid, 200);
});

test("lock: release only drops the file the holder wrote", async () => {
  await using s = await scratch();
  const path = join(s.dir, "lock");
  const isAlive = () => true;

  const first = createLock({ path, pid: 100, isAlive });
  first.acquire();
  createLock({ path, pid: 200, isAlive }).release();
  assert.equal(first.read()?.pid, 100, "another process must not release it");

  first.release();
  assert.equal(first.read(), null);
});

test("journal: a pause is in force until its time, then clears itself", async () => {
  await using s = await scratch();
  const journal = createJournal(join(s.dir, "state"));
  const until = new Date("2026-09-04T00:10:00Z");

  journal.pauseUntil(until, "quota");

  assert.equal(journal.activePause(new Date("2026-09-03T23:00:00Z"))?.reason, "quota");
  assert.equal(journal.activePause(new Date("2026-09-04T00:11:00Z")), null);
  assert.equal(journal.activePause(new Date("2026-09-03T23:00:00Z")), null, "cleared once expired");
});

test("journal: a session is resumable only while its file exists", async () => {
  await using s = await scratch();
  const journal = createJournal(join(s.dir, "state"));
  const record = {
    leafId: "VIN-1",
    rootId: "VIN-0",
    outcome: "interrupted",
    at: "2026-09-03T00:00:00Z",
    durationMs: 10,
    sessionId: "abc",
    sessionFilePath: join(s.dir, "missing.jsonl"),
  };

  journal.recordLeaf(record);
  assert.equal(journal.resumableSession("VIN-1"), null);

  journal.recordLeaf({ ...record, sessionFilePath: join(s.dir, "state", "leaves", "VIN-1.json") });
  assert.equal(journal.resumableSession("VIN-1"), "abc");

  journal.forgetSession("VIN-1");
  assert.equal(journal.resumableSession("VIN-1"), null);
  assert.equal(journal.lastLeaf("VIN-1")?.outcome, "interrupted");
});
