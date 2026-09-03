// Waves come from declared relations. A wrong wave order fails later, for
// reasons that look like anything but ordering — so the sort is locked here.

import test from "node:test";
import assert from "node:assert/strict";
import {
  DependencyCycleError,
  hasDeclaredRelations,
  normalizeDependencies,
  wavesFromRelations,
} from "../.sandcastle/lib/plan.mts";

const ids = (waves) => waves.map((wave) => wave.map((leaf) => leaf.id).sort());

test("wavesFromRelations: independent leaves share one wave", () => {
  const waves = wavesFromRelations([
    { id: "A", blockedBy: [] },
    { id: "B", blockedBy: [] },
  ]);
  assert.deepEqual(ids(waves), [["A", "B"]]);
});

test("wavesFromRelations: a blocked leaf lands after every blocker", () => {
  const waves = wavesFromRelations([
    { id: "C", blockedBy: ["A", "B"] },
    { id: "A", blockedBy: [] },
    { id: "B", blockedBy: ["A"] },
    { id: "D", blockedBy: [] },
  ]);
  assert.deepEqual(ids(waves), [["A", "D"], ["B"], ["C"]]);
});

test("wavesFromRelations: a blocker outside the set counts as done", () => {
  const waves = wavesFromRelations([{ id: "B", blockedBy: ["landed-earlier"] }]);
  assert.deepEqual(ids(waves), [["B"]]);
});

test("wavesFromRelations: a cycle is refused, not guessed at", () => {
  assert.throws(
    () =>
      wavesFromRelations([
        { id: "A", blockedBy: ["B"] },
        { id: "B", blockedBy: ["A"] },
        { id: "C", blockedBy: [] },
      ]),
    (error) => error instanceof DependencyCycleError && error.ids.length === 2,
  );
});

test("hasDeclaredRelations: only relations among the set count", () => {
  assert.equal(hasDeclaredRelations([{ id: "A", blockedBy: ["X"] }]), false);
  assert.equal(
    hasDeclaredRelations([{ id: "A", blockedBy: [] }, { id: "B", blockedBy: ["A"] }]),
    true,
  );
});

test("normalizeDependencies: keeps the planner to the leaves it was given", () => {
  const leaves = [{ id: "A", title: "a" }, { id: "B", title: "b" }];
  const normalized = normalizeDependencies(
    [
      { id: "B", blockedBy: ["A", "A", "B", "INVENTED"] },
      { id: "INVENTED", blockedBy: ["A"] },
    ],
    leaves,
  );
  assert.deepEqual(normalized, [
    { id: "A", title: "a", blockedBy: [] },
    { id: "B", title: "b", blockedBy: ["A"] },
  ]);
});
