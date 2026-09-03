// The orchestrator's decision logic. Two bugs shipped an incomplete feature and
// called it a success — a wave that could not see the wave before it, and a
// blocked agent counted as landed. Both are locked below.

import test from "node:test";
import assert from "node:assert/strict";
import {
  BLOCKED_SIGNAL,
  COMPLETE_SIGNAL,
  classifyOutcome,
  classifyReview,
  isSettled,
  runWaves,
} from "../.sandcastle/lib/pipeline.mts";

const leaf = (id) => ({ id });

function harness({ outcomeFor, waves }) {
  const calls = [];
  const bases = [];

  const deps = {
    branchOf: (id) => `sandcastle/issue-${id}`,
    baseFor: async (landed) => {
      bases.push([...landed]);
      return landed.length === 0 ? "main" : `wave-base(${landed.join("+")})`;
    },
    runLeaf: async (item, branch, baseBranch) => {
      calls.push({ id: item.id, branch, baseBranch });
      return outcomeFor(item.id);
    },
    log: () => {},
    logError: () => {},
  };

  return { deps, calls, bases, waves };
}

test("classifyOutcome: COMPLETE with commits is the only way to land", () => {
  assert.equal(classifyOutcome(COMPLETE_SIGNAL, true), "landed");
});

test("classifyOutcome: BLOCKED is never landed, even with commits", () => {
  assert.equal(classifyOutcome(BLOCKED_SIGNAL, true), "blocked");
  assert.equal(classifyOutcome(BLOCKED_SIGNAL, false), "blocked");
});

test("classifyOutcome: no signal means the agent ran out of iterations", () => {
  assert.equal(classifyOutcome(undefined, true), "exhausted");
  assert.equal(classifyOutcome(undefined, false), "exhausted");
});

test("classifyOutcome: COMPLETE without commits is a legitimate no-op", () => {
  assert.equal(classifyOutcome(COMPLETE_SIGNAL, false), "empty");
});

test("classifyReview: a reviewer that signed off lands the leaf", () => {
  assert.equal(classifyReview(COMPLETE_SIGNAL), "landed");
});

test("classifyReview: a reviewer that could not fix what it found blocks", () => {
  assert.equal(classifyReview(BLOCKED_SIGNAL), "blocked");
});

test("classifyReview: a reviewer that never signed off does not land the leaf", () => {
  assert.equal(
    classifyReview(undefined),
    "exhausted",
    "an unreviewed branch must never be shipped as reviewed",
  );
});

test("classifyReview: only a signed-off review is settled", () => {
  assert.deepEqual(
    [COMPLETE_SIGNAL, BLOCKED_SIGNAL, undefined]
      .map(classifyReview)
      .map(isSettled),
    [true, false, false],
  );
});

test("isSettled: only landed and empty are done with", () => {
  assert.deepEqual(
    ["landed", "empty", "blocked", "exhausted", "failed"].map(isSettled),
    [true, true, false, false, false],
  );
});

test("runWaves: wave 2 is cut from the branches wave 1 landed", async () => {
  const { deps, calls } = harness({ outcomeFor: () => "landed" });

  await runWaves(deps, {
    rootId: "VIN-107",
    waves: [[leaf("A"), leaf("B")], [leaf("C")]],
  });

  assert.deepEqual(
    calls.map((call) => call.baseBranch),
    [
      "main",
      "main",
      "wave-base(sandcastle/issue-A+sandcastle/issue-B)",
    ],
    "the wave-2 leaf must see the code the wave-1 leaves wrote",
  );
});

test("runWaves: a blocked leaf keeps its branch out of the next wave's base", async () => {
  const { deps, calls } = harness({
    outcomeFor: (id) => (id === "A" ? "blocked" : "landed"),
  });

  const result = await runWaves(deps, {
    rootId: "VIN-107",
    waves: [[leaf("A"), leaf("B")], [leaf("C")]],
  });

  assert.equal(result.outcomes.get("A"), "blocked");
  assert.deepEqual(result.landedBranches, [
    "sandcastle/issue-B",
    "sandcastle/issue-C",
  ]);
  assert.equal(calls.at(-1).baseBranch, "wave-base(sandcastle/issue-B)");
});

test("runWaves: an empty leaf settles without joining the base", async () => {
  const { deps } = harness({ outcomeFor: () => "empty" });

  const result = await runWaves(deps, {
    rootId: "VIN-107",
    waves: [[leaf("A")], [leaf("B")]],
  });

  assert.deepEqual(result.landedBranches, []);
  assert.equal(result.outcomes.get("A"), "empty");
  assert.ok(isSettled(result.outcomes.get("A")), "no-ops must not be retried");
});

test("runWaves: a throwing leaf is recorded as failed, not silently landed", async () => {
  const deps = {
    branchOf: (id) => `b/${id}`,
    baseFor: async () => "main",
    runLeaf: async () => {
      throw new Error("docker died");
    },
    log: () => {},
    logError: () => {},
  };

  const result = await runWaves(deps, { rootId: "R", waves: [[leaf("A")]] });

  assert.equal(result.outcomes.get("A"), "failed");
  assert.deepEqual(result.landedBranches, []);
});

test("runWaves: branches landed in an earlier round stay in the base", async () => {
  const { deps, bases } = harness({ outcomeFor: () => "landed" });

  const result = await runWaves(deps, {
    rootId: "R",
    waves: [[leaf("C")]],
    landedBranches: ["sandcastle/issue-A", "sandcastle/issue-B"],
  });

  assert.deepEqual(bases[0], ["sandcastle/issue-A", "sandcastle/issue-B"]);
  assert.deepEqual(result.landedBranches, [
    "sandcastle/issue-A",
    "sandcastle/issue-B",
    "sandcastle/issue-C",
  ]);
});

test("runWaves: landing order is merge order", async () => {
  const { deps } = harness({ outcomeFor: () => "landed" });

  const result = await runWaves(deps, {
    rootId: "R",
    waves: [[leaf("A")], [leaf("B")], [leaf("C")]],
  });

  assert.deepEqual(result.landedBranches, [
    "sandcastle/issue-A",
    "sandcastle/issue-B",
    "sandcastle/issue-C",
  ]);
});

test("runWaves: a leaf whose run crashes is retried before it counts as failed", async () => {
  let attempts = 0;
  const deps = {
    branchOf: (id) => `b/${id}`,
    baseFor: async () => "main",
    runLeaf: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("docker died");
      return "landed";
    },
    log: () => {},
    logError: () => {},
  };

  const result = await runWaves(deps, {
    rootId: "R",
    waves: [[leaf("A")]],
    leafAttempts: 2,
  });

  assert.equal(attempts, 2);
  assert.equal(result.outcomes.get("A"), "landed");
  assert.deepEqual(result.landedBranches, ["b/A"]);
});

test("runWaves: a leaf that crashes every attempt still settles as failed", async () => {
  let attempts = 0;
  const deps = {
    branchOf: (id) => `b/${id}`,
    baseFor: async () => "main",
    runLeaf: async () => {
      attempts += 1;
      throw new Error("docker died");
    },
    log: () => {},
    logError: () => {},
  };

  const result = await runWaves(deps, {
    rootId: "R",
    waves: [[leaf("A")]],
    leafAttempts: 3,
  });

  assert.equal(attempts, 3);
  assert.equal(result.outcomes.get("A"), "failed");
});

test("runWaves: an interrupted leaf is not retried and ends the run", async () => {
  const { InterruptedError } = await import("../.sandcastle/lib/interruption.mts");
  const attempts = [];
  const deps = {
    branchOf: (id) => id,
    baseFor: async () => "main",
    runLeaf: async (item) => {
      attempts.push(item.id);
      if (item.id === "A") throw new InterruptedError("quota");
      return "landed";
    },
    log: () => {},
    logError: () => {},
  };

  await assert.rejects(
    runWaves(deps, {
      rootId: "VIN-1",
      waves: [[leaf("A"), leaf("B")], [leaf("C")]],
      leafAttempts: 3,
    }),
    InterruptedError,
  );

  assert.deepEqual(attempts, ["A", "B"], "no retry of A, no wave 2");
});

test("runWaves: the quota error the runner throws is read as an interruption", async () => {
  const { InterruptedError } = await import("../.sandcastle/lib/interruption.mts");
  let calls = 0;
  const deps = {
    branchOf: (id) => id,
    baseFor: async () => "main",
    runLeaf: async () => {
      calls++;
      throw new Error(
        "claude-code exited with code 1:\nYou've hit your session limit · resets 12:10am (UTC)",
      );
    },
    log: () => {},
    logError: () => {},
  };

  await assert.rejects(
    runWaves(deps, { rootId: "VIN-1", waves: [[leaf("A")]], leafAttempts: 2 }),
    InterruptedError,
  );
  assert.equal(calls, 1);
});

test("isSettled: interrupted is neither settled nor a failure of the leaf", () => {
  assert.equal(isSettled("interrupted"), false);
});
