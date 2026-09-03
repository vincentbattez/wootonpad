// A closed quota window must never be mistaken for a failed leaf — that is
// what turned an idle night into ten rounds of re-planning against a wall.

import test from "node:test";
import assert from "node:assert/strict";
import {
  InterruptedError,
  asInterruption,
  looksLikeQuotaWall,
  parseResetTime,
  quotaLine,
} from "../.sandcastle/lib/interruption.mts";

const RUNNER_ERROR = new Error(
  "claude-code exited with code 1:\nYou've hit your session limit · resets 12:10am (UTC)",
);

test("quotaLine: recognises what Claude Code prints when the window closes", () => {
  assert.equal(
    quotaLine(RUNNER_ERROR.message),
    "You've hit your session limit · resets 12:10am (UTC)",
  );
  assert.equal(quotaLine("Error: ENOENT .sandcastle/foo"), null);
});

test("parseResetTime: the next occurrence of the printed wall-clock time, in UTC", () => {
  const now = new Date("2026-09-03T22:00:00Z");
  assert.equal(
    parseResetTime("resets 12:10am (UTC)", now)?.toISOString(),
    "2026-09-04T00:10:00.000Z",
  );
  assert.equal(
    parseResetTime("resets 11pm (UTC)", now)?.toISOString(),
    "2026-09-03T23:00:00.000Z",
  );
  assert.equal(parseResetTime("resets soon", now), null);
});

test("asInterruption: a quota error becomes an interruption carrying the reset time", () => {
  const now = new Date("2026-09-03T22:00:00Z");
  const interruption = asInterruption(RUNNER_ERROR, now);

  assert.ok(interruption instanceof InterruptedError);
  assert.equal(interruption.resumeAfter?.toISOString(), "2026-09-04T00:10:00.000Z");
  assert.equal(interruption.cause, RUNNER_ERROR);
});

test("asInterruption: reads through wrapped causes", () => {
  const wrapped = new Error("FiberFailure", { cause: RUNNER_ERROR });
  assert.ok(asInterruption(wrapped) instanceof InterruptedError);
});

test("asInterruption: any other crash stays a crash", () => {
  assert.equal(asInterruption(new Error("sandbox died")), null);
  assert.equal(asInterruption("string thrown"), null);
});

test("looksLikeQuotaWall: fast, empty exhaustion is the platform, not the agent", () => {
  const base = { outcome: "exhausted", committed: false, fastFailMs: 120_000 };
  assert.equal(looksLikeQuotaWall({ ...base, durationMs: 15_000 }), true);
  assert.equal(looksLikeQuotaWall({ ...base, durationMs: 1_800_000 }), false);
  assert.equal(looksLikeQuotaWall({ ...base, durationMs: 15_000, committed: true }), false);
  assert.equal(looksLikeQuotaWall({ ...base, durationMs: 15_000, outcome: "blocked" }), false);
});
