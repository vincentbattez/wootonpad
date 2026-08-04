// Host-side git + GitHub operations.
//
// These stay out of the sandboxes on purpose: pushing and opening PRs is
// deterministic work, so there is no reason to hand an SSH key and a gh token
// to an agent running in a container.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.mts";

const exec = promisify(execFile);

// gh resolves fork-shaped repos to the upstream by default, so every gh call
// pins the repo explicitly.
const { remote: REMOTE, baseBranch: BASE_BRANCH } = config.git;
const REPO = config.git.repo!;

async function git(...args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

async function gh(...args: string[]): Promise<string> {
  const { stdout } = await exec("gh", args, { maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

/** `ABC-1`, `ABC-1-2`, `ABC-1-3`, … — matches the integration branch family. */
function integrationBranchPattern(rootId: string): RegExp {
  return new RegExp(`^${rootId}(-\\d+)?$`);
}

/**
 * Pick the first unused integration branch name for a root. Re-runs never
 * reuse a name: a previous attempt's branch and PR stay readable.
 */
export async function nextIntegrationBranch(rootId: string): Promise<string> {
  const remote = await git("ls-remote", "--heads", REMOTE);
  const local = await git("branch", "--format=%(refname:short)");

  const taken = new Set<string>();
  for (const line of remote.split("\n")) {
    const match = line.match(/refs\/heads\/(.+)$/);
    if (match) taken.add(match[1]!);
  }
  for (const line of local.split("\n")) {
    if (line.trim()) taken.add(line.trim());
  }

  if (!taken.has(rootId)) return rootId;

  for (let n = 2; ; n++) {
    const candidate = `${rootId}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * Whether a branch carries work not already on main. Asked of git rather than
 * tracked in memory: leaf branches outlive a single run, so a branch that
 * committed during an earlier invocation must still count as mergeable.
 */
export async function branchHasCommits(branch: string): Promise<boolean> {
  try {
    const count = await git("rev-list", "--count", `${BASE_BRANCH}..${branch}`);
    return Number(count) > 0;
  } catch {
    return false; // branch doesn't exist
  }
}

export async function pushBranch(branch: string): Promise<void> {
  await git("push", "--set-upstream", REMOTE, branch);
}

export async function createPullRequest(options: {
  branch: string;
  title: string;
  body: string;
}): Promise<string> {
  return gh(
    "pr",
    "create",
    "--repo",
    REPO,
    "--base",
    BASE_BRANCH,
    "--head",
    options.branch,
    "--title",
    options.title,
    "--body",
    options.body,
  );
}

interface OpenPr {
  number: number;
  headRefName: string;
}

/**
 * Close any still-open PR from an earlier attempt at the same root, so the
 * backlog doesn't accumulate PRs that are strict subsets of one another.
 */
export async function supersedePreviousPrs(
  rootId: string,
  currentBranch: string,
  replacementUrl: string,
): Promise<number[]> {
  const raw = await gh(
    "pr",
    "list",
    "--repo",
    REPO,
    "--state",
    "open",
    "--json",
    "number,headRefName",
    "--limit",
    "100",
  );

  const pattern = integrationBranchPattern(rootId);
  const stale: OpenPr[] = JSON.parse(raw).filter(
    (pr: OpenPr) =>
      pattern.test(pr.headRefName) && pr.headRefName !== currentBranch,
  );

  for (const pr of stale) {
    await gh(
      "pr",
      "close",
      String(pr.number),
      "--repo",
      REPO,
      "--comment",
      `Superseded by ${replacementUrl}`,
    );
  }

  return stale.map((pr) => pr.number);
}
