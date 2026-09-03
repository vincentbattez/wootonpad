// The git half of the wave chaining, against a throwaway repo.
//
// These lock the collateral damage of chaining the bases: `branchHasCommits`
// measured against `main` reads a wave-2 branch as "has work" when its agent
// wrote nothing, and a leaf carried over from an earlier run keeps its stale
// base unless something puts it back on top.

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createGit } from "../.sandcastle/lib/git-core.mts";

const exec = promisify(execFile);

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-git-"));
  const git = (...args) => exec("git", args, { cwd }).then((r) => r.stdout.trim());

  await git("init", "--initial-branch=main");
  await git("config", "user.email", "test@example.com");
  await git("config", "user.name", "Test");

  const commit = async (file, body) => {
    await writeFile(join(cwd, file), body);
    await git("add", file);
    await git("commit", "-m", `add ${file}`);
    return git("rev-parse", "HEAD");
  };

  await commit("README.md", "base\n");

  return {
    cwd,
    git,
    commit,
    ops: createGit({
      cwd,
      baseBranch: "main",
      worktreeRoot: join(cwd, ".worktrees"),
      ignoreChurn: ["README.md"],
    }),
    cleanup: () => rm(cwd, { recursive: true, force: true }),
  };
}

test("branchHasCommits: a wave-2 branch that wrote nothing reads as empty", async (t) => {
  const { git, commit, ops, cleanup } = await fixture();
  t.after(cleanup);

  await git("checkout", "-b", "wave1");
  await commit("wave1.txt", "one\n");
  await git("checkout", "-b", "wave2"); // inherits wave1, adds nothing

  assert.equal(
    await ops.branchHasCommits("wave2", "main"),
    true,
    "against main it looks productive — this is the trap",
  );
  assert.equal(
    await ops.branchHasCommits("wave2", "wave1"),
    false,
    "against its effective base the truth comes out",
  );
});

test("branchHasCommits: real work against the effective base still counts", async (t) => {
  const { git, commit, ops, cleanup } = await fixture();
  t.after(cleanup);

  await git("checkout", "-b", "wave1");
  await commit("wave1.txt", "one\n");
  await git("checkout", "-b", "wave2");
  await commit("wave2.txt", "two\n");

  assert.equal(await ops.branchHasCommits("wave2", "wave1"), true);
});

test("branchHasCommits: a branch that does not exist has no commits", async (t) => {
  const { ops, cleanup } = await fixture();
  t.after(cleanup);

  assert.equal(await ops.branchHasCommits("nope", "main"), false);
});

test("buildWaveBase: with nothing landed, the base is the base branch", async (t) => {
  const { ops, cleanup } = await fixture();
  t.after(cleanup);

  assert.equal(await ops.buildWaveBase("wave-base/R", "main", []), "main");
});

test("buildWaveBase: carries every landed branch's files", async (t) => {
  const { git, commit, ops, cleanup } = await fixture();
  t.after(cleanup);

  await git("checkout", "-b", "leaf-a", "main");
  await commit("a.txt", "a\n");
  await git("checkout", "-b", "leaf-b", "main");
  await commit("b.txt", "b\n");
  await git("checkout", "main");

  const base = await ops.buildWaveBase("wave-base/R", "main", ["leaf-a", "leaf-b"]);
  assert.equal(base, "wave-base/R");

  const files = await git("ls-tree", "--name-only", "-r", base);
  assert.deepEqual(files.split("\n").sort(), ["README.md", "a.txt", "b.txt"]);
});

test("buildWaveBase: rebuilt from the base branch, never drifting", async (t) => {
  const { git, commit, ops, cleanup } = await fixture();
  t.after(cleanup);

  await git("checkout", "-b", "leaf-a", "main");
  await commit("a.txt", "a\n");
  await git("checkout", "-b", "leaf-b", "main");
  await commit("b.txt", "b\n");
  await git("checkout", "main");

  await ops.buildWaveBase("wave-base/R", "main", ["leaf-a", "leaf-b"]);
  await ops.buildWaveBase("wave-base/R", "main", ["leaf-a"]);

  const files = await git("ls-tree", "--name-only", "-r", "wave-base/R");
  assert.deepEqual(
    files.split("\n").sort(),
    ["README.md", "a.txt"],
    "dropping a branch from the list must drop it from the base",
  );
});

test("buildWaveBase: a conflict throws instead of shipping a guess", async (t) => {
  const { git, commit, ops, cleanup } = await fixture();
  t.after(cleanup);

  await git("checkout", "-b", "leaf-a", "main");
  await commit("shared.txt", "from a\n");
  await git("checkout", "-b", "leaf-b", "main");
  await commit("shared.txt", "from b\n");
  await git("checkout", "main");

  await assert.rejects(
    () => ops.buildWaveBase("wave-base/R", "main", ["leaf-a", "leaf-b"]),
    /Cannot assemble wave-base\/R: merging leaf-b conflicts/,
  );
});

test("buildWaveBase: leaves no worktree behind, success or failure", async (t) => {
  const { git, commit, ops, cleanup } = await fixture();
  t.after(cleanup);

  await git("checkout", "-b", "leaf-a", "main");
  await commit("shared.txt", "from a\n");
  await git("checkout", "-b", "leaf-b", "main");
  await commit("shared.txt", "from b\n");
  await git("checkout", "main");

  await ops.buildWaveBase("wave-base/R", "main", ["leaf-a"]);
  await ops.buildWaveBase("wave-base/R", "main", ["leaf-a", "leaf-b"]).catch(() => {});

  const worktrees = await git("worktree", "list");
  assert.equal(worktrees.split("\n").length, 1, worktrees);
});

test("rebaseLeafOnto: a branch with no work of its own is recut from the base", async (t) => {
  const { git, commit, ops, cleanup } = await fixture();
  t.after(cleanup);

  await git("branch", "leaf", "main"); // created against main by an earlier run
  await git("checkout", "-b", "wave1", "main");
  const tip = await commit("wave1.txt", "one\n");
  await git("checkout", "main");

  await ops.rebaseLeafOnto("leaf", "wave1");

  assert.equal(await ops.tipOf("leaf"), tip);
});

test("rebaseLeafOnto: a branch with its own work keeps it and gains the base", async (t) => {
  const { git, commit, ops, cleanup } = await fixture();
  t.after(cleanup);

  await git("checkout", "-b", "leaf", "main");
  await commit("leaf.txt", "leaf\n");
  await git("checkout", "-b", "wave1", "main");
  await commit("wave1.txt", "one\n");
  await git("checkout", "main");

  await ops.rebaseLeafOnto("leaf", "wave1");

  assert.equal(await ops.isAncestor("wave1", "leaf"), true);
  const files = await git("ls-tree", "--name-only", "-r", "leaf");
  assert.deepEqual(files.split("\n").sort(), [
    "README.md",
    "leaf.txt",
    "wave1.txt",
  ]);
});

test("rebaseLeafOnto: a branch already on top of the base is left alone", async (t) => {
  const { git, commit, ops, cleanup } = await fixture();
  t.after(cleanup);

  await git("checkout", "-b", "wave1", "main");
  await commit("wave1.txt", "one\n");
  await git("checkout", "-b", "leaf");
  const tip = await commit("leaf.txt", "leaf\n");
  await git("checkout", "main");

  await ops.rebaseLeafOnto("leaf", "wave1");

  assert.equal(await ops.tipOf("leaf"), tip);
});

test("rebaseLeafOnto: a branch that does not exist yet is left to sandcastle", async (t) => {
  const { ops, cleanup } = await fixture();
  t.after(cleanup);

  await ops.rebaseLeafOnto("never-created", "main");
  assert.equal(await ops.tipOf("never-created"), null);
});

test("rebaseLeafOnto: a leaf whose work conflicts with the new base is recut from it", async (t) => {
  const { git, commit, ops, cleanup } = await fixture();
  t.after(cleanup);

  await git("checkout", "-b", "leaf", "main");
  await commit("shared.txt", "leaf version\n");
  await git("checkout", "-b", "wave1", "main");
  const tip = await commit("shared.txt", "wave1 version\n");
  await git("checkout", "main");

  assert.equal(await ops.rebaseLeafOnto("leaf", "wave1"), "restarted");
  assert.equal(await ops.tipOf("leaf"), tip);
});

test("rebaseLeafOnto: a conflict leaves no worktree behind", async (t) => {
  const { git, commit, ops, cleanup } = await fixture();
  t.after(cleanup);

  await git("checkout", "-b", "leaf", "main");
  await commit("shared.txt", "leaf version\n");
  await git("checkout", "-b", "wave1", "main");
  await commit("shared.txt", "wave1 version\n");
  await git("checkout", "main");

  await ops.rebaseLeafOnto("leaf", "wave1");

  const worktrees = await git("worktree", "list");
  assert.equal(worktrees.split("\n").length, 1, worktrees);
});

test("buildWaveBase: a conflict between two landed leaves is still fatal", async (t) => {
  const { git, commit, ops, cleanup } = await fixture();
  t.after(cleanup);

  await git("checkout", "-b", "leaf-a", "main");
  await commit("shared.txt", "a\n");
  await git("checkout", "-b", "leaf-b", "main");
  await commit("shared.txt", "b\n");
  await git("checkout", "main");

  await assert.rejects(
    () => ops.buildWaveBase("wave-base/R", "main", ["leaf-a", "leaf-b"]),
    /Cannot assemble wave-base\/R: merging leaf-b conflicts/,
  );
});

test("resetBranchTo: creates the branch when it does not exist", async (t) => {
  const { git, commit, ops, cleanup } = await fixture();
  t.after(cleanup);

  const tip = await commit("one.txt", "one\n");
  await ops.resetBranchTo("wave-base/R", "main");

  assert.equal(await ops.tipOf("wave-base/R"), tip);
});

test("resetBranchTo: moves a branch a killed run left checked out", async (t) => {
  const { cwd, git, commit, ops, cleanup } = await fixture();
  t.after(cleanup);

  await git("branch", "wave-base/R", "main");
  await git("worktree", "add", join(cwd, "stale"), "wave-base/R");
  await git("checkout", "-b", "leaf", "main");
  const tip = await commit("leaf.txt", "leaf\n");
  await git("checkout", "main");

  await ops.resetBranchTo("wave-base/R", "leaf");

  assert.equal(await ops.tipOf("wave-base/R"), tip);
});

test("mergeBranches: stops at the first conflict and keeps what applied before it", async (t) => {
  const { git, commit, ops, cleanup } = await fixture();
  t.after(cleanup);

  await commit("shared.txt", "base\n");

  await git("checkout", "-b", "a");
  await commit("a.txt", "a\n");

  await git("checkout", "main");
  await git("checkout", "-b", "b");
  await commit("shared.txt", "from b\n");

  await git("checkout", "main");
  await git("checkout", "-b", "c");
  await commit("shared.txt", "from c\n");
  await git("checkout", "main");

  await ops.resetBranchTo("integration", "main");

  assert.equal(await ops.mergeBranches("integration", ["a", "b", "c"]), "c");
  assert.equal(await ops.isAncestor("a", "integration"), true, "a stayed merged");
  assert.equal(await ops.isAncestor("b", "integration"), true, "b stayed merged");
  assert.equal(await ops.isAncestor("c", "integration"), false);
  assert.equal(await ops.mergeBranches("integration", ["a", "b"]), null, "already merged is a no-op");
});

test("sweepWorktrees: drops old clean worktrees, keeps dirty ones whatever their age", async (t) => {
  const { git, cwd, ops, cleanup } = await fixture();
  t.after(cleanup);

  const root = join(cwd, ".worktrees");
  await git("worktree", "add", "-b", "clean", join(root, "clean"), "main");
  await git("worktree", "add", "-b", "dirty", join(root, "dirty"), "main");
  await writeFile(join(root, "dirty", "wip.txt"), "uncommitted\n");
  await writeFile(join(root, "clean", "README.md"), "churn\n"); // ignored, see fixture

  const recent = await ops.sweepWorktrees({ olderThanMs: 60_000 });
  assert.deepEqual(recent.removed, []);
  assert.deepEqual(recent.dirty.map((w) => w.branch), ["dirty"]);
  assert.deepEqual(recent.kept.map((w) => w.branch), ["clean"]);

  const later = await ops.sweepWorktrees({ olderThanMs: 60_000, now: Date.now() + 120_000 });
  assert.deepEqual(later.removed.map((w) => w.branch), ["clean"]);
  assert.deepEqual(later.dirty.map((w) => w.branch), ["dirty"]);

  const all = await ops.sweepWorktrees({ olderThanMs: 60_000, all: true });
  assert.deepEqual(all.removed, [], "a dirty worktree is never swept, even with all");
  assert.deepEqual((await ops.listWorktrees()).map((w) => w.branch), ["dirty"]);
});
