// Picking up where a previous attempt stopped.
//
// The epic that motivated this shipped 14 issues into an unmerged integration
// branch, then started its last three from a pristine `main` and got three
// empty branches back. Nothing was wrong with the plan — the run simply could
// not see its own earlier work.

import test from "node:test";
import assert from "node:assert/strict";
import {
  alreadyLanded,
  attemptNumber,
  integrationCandidates,
  pickResumeBase,
} from "../.sandcastle/lib/resume.mts";

test("attemptNumber: the unsuffixed branch is attempt 1", () => {
  assert.equal(attemptNumber("VIN-107", "VIN-107"), 1);
  assert.equal(attemptNumber("VIN-107", "VIN-107-2"), 2);
  assert.equal(attemptNumber("VIN-107", "VIN-107-10"), 10);
});

test("attemptNumber: another root's branches are not ours", () => {
  assert.equal(attemptNumber("VIN-107", "VIN-108"), null);
  assert.equal(attemptNumber("VIN-107", "sandcastle/issue-VIN-107"), null);
  assert.equal(attemptNumber("VIN-107", "main"), null);
  assert.equal(attemptNumber("VIN-10", "VIN-107"), null);
});

test("integrationCandidates: ordered oldest attempt first", () => {
  const found = integrationCandidates(
    "VIN-107",
    ["main", "VIN-107-2", "VIN-107", "VIN-108", "VIN-107-10"],
    "origin",
  );

  assert.deepEqual(
    found.map((c) => c.attempt),
    [1, 2, 10],
  );
});

test("integrationCandidates: a remote-only attempt still counts", () => {
  const found = integrationCandidates("VIN-107", ["origin/VIN-107-3"], "origin");

  assert.deepEqual(found, [
    { ref: "origin/VIN-107-3", attempt: 3, isRemote: true },
  ]);
});

test("integrationCandidates: the local branch wins over its remote twin", () => {
  for (const refs of [
    ["origin/VIN-107-2", "VIN-107-2"],
    ["VIN-107-2", "origin/VIN-107-2"],
  ]) {
    const found = integrationCandidates("VIN-107", refs, "origin");
    assert.deepEqual(found, [
      { ref: "VIN-107-2", attempt: 2, isRemote: false },
    ]);
  }
});

const never = async () => false;

test("pickResumeBase: with no previous attempt, start from the base branch", async () => {
  const base = await pickResumeBase("VIN-107", {
    baseBranch: "main",
    remote: "origin",
    refs: ["main", "VIN-108"],
    isMergedIntoBase: never,
  });

  assert.equal(base, "main");
});

test("pickResumeBase: resume from the newest unmerged attempt", async () => {
  const base = await pickResumeBase("VIN-107", {
    baseBranch: "main",
    remote: "origin",
    refs: ["main", "VIN-107", "VIN-107-2"],
    isMergedIntoBase: never,
  });

  assert.equal(base, "VIN-107-2");
});

test("pickResumeBase: an attempt already merged into main is not a resume point", async () => {
  const base = await pickResumeBase("VIN-107", {
    baseBranch: "main",
    remote: "origin",
    refs: ["main", "VIN-107-2"],
    isMergedIntoBase: async (ref) => ref === "VIN-107-2",
  });

  assert.equal(base, "main");
});

test("pickResumeBase: falls back to the older attempt when the newest is merged", async () => {
  const base = await pickResumeBase("VIN-107", {
    baseBranch: "main",
    remote: "origin",
    refs: ["VIN-107", "VIN-107-2", "VIN-107-3"],
    isMergedIntoBase: async (ref) => ref === "VIN-107-3",
  });

  assert.equal(base, "VIN-107-2");
});

test("alreadyLanded: work folded into the resume base needs no agent", async () => {
  assert.equal(
    await alreadyLanded("sandcastle/issue-VIN-108", {
      hasOwnWork: async () => true,
      isContainedInResumeBase: async () => true,
    }),
    true,
  );
});

test("alreadyLanded: a branch that never produced anything is still to do", async () => {
  let asked = false;

  const landed = await alreadyLanded("sandcastle/issue-VIN-117", {
    hasOwnWork: async () => false,
    isContainedInResumeBase: async () => {
      asked = true;
      return true; // an empty branch is contained in everything
    },
  });

  assert.equal(landed, false, "an empty branch is the work, not the result");
  assert.equal(asked, false, "containment must not be asked once it is moot");
});

test("alreadyLanded: work not yet in the resume base is still to do", async () => {
  assert.equal(
    await alreadyLanded("sandcastle/issue-VIN-118", {
      hasOwnWork: async () => true,
      isContainedInResumeBase: async () => false,
    }),
    false,
  );
});
