// Host-side git plumbing, as a factory over a repo directory.
//
// Kept apart from `github.mts` (which is about `gh`) and from `git.mts` (which
// binds this to the project config): a factory is what lets the tests run these
// against a throwaway repo instead of the developer's checkout.
//
// Wave chaining decision: the cumulative base of a wave is built here, by a
// deterministic `git merge` in a throwaway worktree. Nothing here ever *judges*
// a conflict — a merge heuristic hiding one would make it unreadable. What
// happens next is decided by whoever asked: assembling a wave base throws, and
// `main.mts` escalates that to an agent; rebasing a leaf drops the leaf's own
// work, which costs an agent round and nothing else.

import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

/** What `rebaseLeafOnto` did — `restarted` means the leaf's work was dropped. */
export type RebaseOutcome =
  | "absent"
  | "unchanged"
  | "recut"
  | "merged"
  | "restarted";

export interface GitOptions {
  /** Repo root every command runs from. */
  cwd: string;
  /** Branch the work is based on, and the default yardstick for "has work". */
  baseBranch: string;
  /** Directory the throwaway merge worktrees are created under. */
  worktreeRoot: string;
}

export function createGit({ cwd, baseBranch, worktreeRoot }: GitOptions) {
  const run = async (dir: string, args: string[]): Promise<string> => {
    const { stdout } = await exec("git", args, {
      cwd: dir,
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout.trim();
  };

  const git = (...args: string[]) => run(cwd, args);

  /** The commit a ref points at, or null when it doesn't exist. */
  const tipOf = async (rev: string): Promise<string | null> => {
    try {
      return await git("rev-parse", "--verify", rev);
    } catch {
      return null;
    }
  };

  const isAncestor = async (
    ancestor: string,
    descendant: string,
  ): Promise<boolean> => {
    try {
      await git("merge-base", "--is-ancestor", ancestor, descendant);
      return true;
    } catch {
      return false;
    }
  };

  /**
   * Whether a branch carries work of its own, measured against the base it was
   * actually built on. Once waves chain, `main..branch` is meaningless: a
   * wave-2 branch inherits wave 1's commits and would read as "has work" while
   * its own agent wrote nothing. The effective base has to be passed in.
   */
  const branchHasCommits = async (
    branch: string,
    base: string = baseBranch,
  ): Promise<boolean> => {
    try {
      return Number(await git("rev-list", "--count", `${base}..${branch}`)) > 0;
    } catch {
      return false; // branch doesn't exist
    }
  };

  /**
   * Check `branch` out in a throwaway worktree, merge `sources` into it in
   * order, and dispose of the worktree. `startPoint` resets the branch to it
   * first. Returns the first source that conflicted, or null when every merge
   * applied — a conflict means something different depending on who asked, so
   * the caller decides whether it is fatal.
   */
  const mergeInWorktree = async (
    branch: string,
    startPoint: string | null,
    sources: string[],
  ): Promise<string | null> => {
    const dir = join(worktreeRoot, `host-${branch.replace(/[^\w.-]+/g, "-")}`);
    await rm(dir, { recursive: true, force: true });
    await git("worktree", "prune");
    await git(
      "worktree",
      "add",
      "--force",
      ...(startPoint ? ["-B", branch, dir, startPoint] : [dir, branch]),
    );

    try {
      for (const source of sources) {
        try {
          await run(dir, ["merge", "--no-ff", "--no-edit", source]);
        } catch {
          await run(dir, ["merge", "--abort"]).catch(() => {});
          return source;
        }
      }

      return null;
    } finally {
      await git("worktree", "remove", "--force", dir).catch(() => {});
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  };

  /**
   * The branch a wave is cut from: `base` plus every leaf branch that landed
   * before it, in landing order. Rebuilt from scratch on every wave, so it
   * never drifts from the list it is meant to represent. `base` is the root's
   * resume point, not necessarily the project's base branch.
   */
  const buildWaveBase = async (
    branch: string,
    base: string,
    sources: string[],
  ): Promise<string> => {
    if (sources.length === 0) return base;

    const conflict = await mergeInWorktree(branch, base, sources);
    if (conflict) {
      throw new Error(
        `Cannot assemble ${branch}: merging ${conflict} conflicts. ` +
          `Two issues in the same or an earlier wave touch the same lines — ` +
          `fix the plan, not the merge.`,
      );
    }

    return branch;
  };

  /**
   * Point `branch` at `base`, creating it if it does not exist yet. A run that
   * was killed leaves worktrees behind holding branches git then refuses to
   * move; those worktrees are disposable and the ref is what matters, so the
   * refusal is worked around rather than raised.
   */
  const resetBranchTo = async (branch: string, base: string): Promise<void> => {
    try {
      await git("branch", "--force", branch, base);
    } catch (cause) {
      const tip = await tipOf(base);
      if (tip === null) throw cause;

      await git("worktree", "prune");
      await git("update-ref", `refs/heads/${branch}`, tip);
    }
  };

  /**
   * Put an existing leaf branch on top of `base` before an agent resumes on it.
   * Sandcastle ignores `baseBranch` when the branch already exists, so a leaf
   * carried over from an earlier run would otherwise keep its stale base and
   * the wave chaining would be a no-op for exactly the leaves that need it.
   *
   * A conflict here is not the planning bug `buildWaveBase` reports: the leaf's
   * own dependency was re-worked after the leaf built on it, which is what a
   * retry round does for a living. The stale work is dropped and the leaf recut
   * from the base it should have had — re-implementing a leaf is what the
   * pipeline already does, and it keeps the whole root from dying on it.
   */
  const rebaseLeafOnto = async (
    branch: string,
    base: string,
  ): Promise<RebaseOutcome> => {
    if ((await tipOf(branch)) === null) return "absent"; // sandcastle cuts it
    if (await isAncestor(base, branch)) return "unchanged";

    if (!(await branchHasCommits(branch, base))) {
      await resetBranchTo(branch, base);
      return "recut";
    }

    if ((await mergeInWorktree(branch, null, [base])) === null) return "merged";

    await resetBranchTo(branch, base);
    return "restarted";
  };

  /** Every branch known locally, plus every branch known on the remote. */
  const listRefs = async (remote: string): Promise<string[]> => {
    const out = await git(
      "for-each-ref",
      "--format=%(refname:short)",
      "refs/heads",
      `refs/remotes/${remote}`,
    );
    return out ? out.split("\n") : [];
  };

  /** Best-effort: a stale remote view is worse than a slow start, never fatal. */
  const fetchRemote = async (remote: string): Promise<void> => {
    await git("fetch", "--prune", remote).catch(() => {});
  };

  return {
    git,
    listRefs,
    fetchRemote,
    tipOf,
    isAncestor,
    branchHasCommits,
    buildWaveBase,
    rebaseLeafOnto,
    resetBranchTo,
  };
}

export type Git = ReturnType<typeof createGit>;
