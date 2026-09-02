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
