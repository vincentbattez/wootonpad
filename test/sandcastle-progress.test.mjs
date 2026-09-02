// Phase markers, against a throwaway repo.
//
// Chaining the wave bases moves the tip a leaf is worked on. A marker that only
// records the branch tip would either redo signed-off work, or — worse — mark a
// tip `reviewed` that no reviewer ever saw. Both directions are locked here.

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { createProgress } from "../.sandcastle/lib/progress.mts";

const exec = promisify(execFile);

async function fixture() {
  const cwd = await mkdtemp(join(tmpdir(), "sandcastle-progress-"));
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

  const base = await commit("README.md", "base\n");

  return {
    git,
    commit,
    base,
    progress: createProgress(cwd),
    cleanup: () => rm(cwd, { recursive: true, force: true }),
  };
}

test("an unmarked phase is not done", async (t) => {
  const { progress, base, cleanup } = await fixture();
  t.after(cleanup);

  assert.equal(await progress.phaseDone("implemented", "VIN-1", base, base), false);
});

test("a marked phase is done when both tip and base still match", async (t) => {
  const { progress, base, commit, cleanup } = await fixture();
  t.after(cleanup);

  const tip = await commit("work.txt", "work\n");
  await progress.markPhase("implemented", "VIN-1", tip, base);

  assert.equal(await progress.phaseDone("implemented", "VIN-1", tip, base), true);
});

test("moving the branch tip invalidates the marker", async (t) => {
  const { progress, base, commit, cleanup } = await fixture();
  t.after(cleanup);

  const tip = await commit("work.txt", "work\n");
  await progress.markPhase("implemented", "VIN-1", tip, base);
  const moved = await commit("more.txt", "more\n");

  assert.equal(await progress.phaseDone("implemented", "VIN-1", moved, base), false);
});

test("moving the base invalidates the marker even at the same tip", async (t) => {
  const { progress, git, base, commit, cleanup } = await fixture();
  t.after(cleanup);

  const tip = await commit("work.txt", "work\n");
  await progress.markPhase("reviewed", "VIN-1", tip, base);

  await git("checkout", "-b", "wave1", "main");
  const newBase = await commit("wave1.txt", "one\n");

  assert.notEqual(newBase, base);
  assert.equal(
    await progress.phaseDone("reviewed", "VIN-1", tip, newBase),
    false,
    "reviewed on top of main is not reviewed on top of main + wave 1",
  );
});

test("markers are per phase and per issue", async (t) => {
  const { progress, base, commit, cleanup } = await fixture();
  t.after(cleanup);

  const tip = await commit("work.txt", "work\n");
  await progress.markPhase("implemented", "VIN-1", tip, base);

  assert.equal(await progress.phaseDone("reviewed", "VIN-1", tip, base), false);
  assert.equal(await progress.phaseDone("implemented", "VIN-2", tip, base), false);
});

test("re-marking on a new base clears the old one", async (t) => {
  const { progress, git, base, commit, cleanup } = await fixture();
  t.after(cleanup);

  const tip = await commit("work.txt", "work\n");
  await progress.markPhase("implemented", "VIN-1", tip, base);

  await git("checkout", "-b", "wave1", "main");
  const newBase = await commit("wave1.txt", "one\n");
  await progress.markPhase("implemented", "VIN-1", tip, newBase);

  assert.equal(await progress.phaseDone("implemented", "VIN-1", tip, newBase), true);
  assert.equal(await progress.phaseDone("implemented", "VIN-1", tip, base), false);
});

test("markers live outside refs/heads, so they never look like branches", async (t) => {
  const { progress, git, base, commit, cleanup } = await fixture();
  t.after(cleanup);

  const tip = await commit("work.txt", "work\n");
  await progress.markPhase("implemented", "VIN-1", tip, base);

  assert.equal(await git("branch", "--format=%(refname:short)"), "main");
  assert.equal(await git("tag", "--list"), "");
});

test("clearing a phase sends it back to never done", async (t) => {
  const { progress, base, commit, cleanup } = await fixture();
  t.after(cleanup);

  const tip = await commit("work.txt", "work\n");
  await progress.markPhase("implemented", "VIN-1", tip, base);
  await progress.clearPhase("implemented", "VIN-1");

  assert.equal(await progress.phaseDone("implemented", "VIN-1", tip, base), false);
});

test("clearing a phase that was never marked is a no-op", async (t) => {
  const { progress, cleanup } = await fixture();
  t.after(cleanup);

  await progress.clearPhase("reviewed", "VIN-1");
});
