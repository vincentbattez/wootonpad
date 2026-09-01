// Feature-scoped orchestration — one Linear issue tree in, one pull request out.
//
//   npm run sandcastle ABC-1 ABC-9
//
// Project-specific settings live in `.sandcastle/config.json`.
//
// Each argument is a *root* issue. Its leaves (recursively) are the work items;
// intermediate nodes are specs, not tasks. A root with no children is its own
// leaf. With no arguments, every eligible root in the project is worked.
//
// Per root, independently of the others:
//   1. Plan     — an opus agent groups the remaining leaves into dependency waves.
//   2. Execute  — one sandbox per leaf, branched from the base branch.
//                 Implementer, then reviewer if the implementer committed.
//                 Waves run in order, leaves inside a wave run concurrently.
//   3. Retry    — up to `agent.retryRounds` rounds, re-planning what is left.
//   4. Ship     — only when every eligible leaf landed: an agent assembles the
//                 integration branch, then the host pushes it and opens a PR.
//
// A root that never completes ships nothing; the other roots are unaffected.

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { z } from "zod";
import { config, checkedPromptArgs } from "./lib/config.mts";
import { markPhase, phaseDone, tipOf } from "./lib/progress.mts";
import {
  branchHasCommits,
  createPullRequest,
  nextIntegrationBranch,
  pushBranch,
  supersedePreviousPrs,
} from "./lib/github.mts";
import {
  discoverRootIds,
  fetchIssueTree,
  descendantIds,
  isEligible,
  leavesOf,
  setState,
  trySetState,
  type Issue,
} from "./lib/linear.mts";

const planSchema = z.object({
  waves: z.array(
    z.array(z.object({ id: z.string(), title: z.string(), branch: z.string() })),
  ),
});

// ---------------------------------------------------------------------------
// Configuration — everything project-specific lives in .sandcastle/config.json
// ---------------------------------------------------------------------------

const MODEL = config.agent.model;
const BASE_BRANCH = config.git.baseBranch;

const hooks = {
  sandbox: { onSandboxReady: [{ command: config.sandbox.installCommand }] },
};

const copyToWorktree = config.sandbox.copyToWorktree;

/** Deterministic, so a re-run resumes the branch instead of starting over. */
const leafBranch = (id: string) => `${config.git.branchPrefix}${id}`;

/** Shared by every prompt that tells an agent how to check its own work. */
const projectPromptArgs = {
  VERIFY_COMMANDS: config.project.verifyCommands
    .map((command) => `- \`${command}\``)
    .join("\n"),
  COMMIT_PREFIX: config.project.commitPrefix,
  CODING_STANDARDS: config.project.codingStandardsFile,
};

const PROMPTS = {
  plan: "./.sandcastle/plan-prompt.md",
  implement: "./.sandcastle/implement-prompt.md",
  review: "./.sandcastle/review-prompt.md",
  integrate: "./.sandcastle/integrate-prompt.md",
};

// ---------------------------------------------------------------------------
// Root resolution
// ---------------------------------------------------------------------------

interface Root {
  issue: Issue;
  eligibleLeaves: Issue[];
  skippedLeaves: Issue[];
}

function parseArgs(): string[] {
  const ids = process.argv.slice(2);
  const malformed = ids.filter((id) => !/^[A-Za-z]+-\d+$/.test(id));

  if (malformed.length > 0) {
    throw new Error(
      `Not a Linear issue identifier: ${malformed.join(", ")}. Expected e.g. ABC-1.`,
    );
  }

  return ids.map((id) => id.toUpperCase());
}

/**
 * Passing both a parent and one of its descendants would put two agents on the
 * same issue. It is almost always a typo, so refuse rather than guess.
 */
function assertNoNesting(roots: Root[]): void {
  for (const root of roots) {
    const descendants = descendantIds(root.issue);
    for (const other of roots) {
      if (other !== root && descendants.has(other.issue.id)) {
        throw new Error(
          `${other.issue.id} is a descendant of ${root.issue.id} — pick one or the other.`,
        );
      }
    }
  }
}

async function resolveRoot(id: string): Promise<Root> {
  const issue = await fetchIssueTree(id);
  const leaves = leavesOf(issue);

  return {
    issue,
    eligibleLeaves: leaves.filter(isEligible),
    skippedLeaves: leaves.filter((leaf) => !isEligible(leaf)),
  };
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

/**
 * An agent that ran out of iterations returns normally — only `completionSignal`
 * distinguishes "finished" from "gave up". Without this check the all-or-nothing
 * gate would pass on unfinished work.
 */
const signalledDone = (result: { completionSignal?: string }) =>
  result.completionSignal !== undefined;

/**
 * Each phase runs only if its marker is stale, so a re-run picks up where the
 * last one stopped: implement what was never implemented, review what the
 * implementer changed since the last review, skip a leaf that is settled.
 */
async function runLeaf(leaf: Issue, branch: string): Promise<boolean> {
  const existing = await tipOf(branch);
  const needsImplement =
    existing === null || !(await phaseDone("implemented", leaf.id, existing));
  const needsReview =
    needsImplement ||
    (existing !== null && !(await phaseDone("reviewed", leaf.id, existing)));

  if (!needsImplement && !needsReview) {
    console.log(`[${leaf.id}] implemented and reviewed already — skipping`);
    return true;
  }

  await trySetState(leaf.id, config.linear.inProgressState);

  const sandbox = await sandcastle.createSandbox({
    branch,
    baseBranch: BASE_BRANCH,
    sandbox: docker(),
    hooks,
    copyToWorktree,
  });

  try {
    let done = !needsImplement;

    if (needsImplement) {
      const implement = await sandbox.run({
        name: "implementer",
        maxIterations: config.agent.implementIterations,
        agent: sandcastle.claudeCode(MODEL),
        promptFile: PROMPTS.implement,
        promptArgs: checkedPromptArgs(PROMPTS.implement, {
          ...projectPromptArgs,
          TASK_ID: leaf.id,
          ISSUE_TITLE: leaf.title,
          BRANCH: branch,
        }),
      });

      done = signalledDone(implement);
      const tip = await tipOf(branch);
      if (done && tip) await markPhase("implemented", leaf.id, tip);
    } else {
      console.log(`[${leaf.id}] already implemented — reviewing only`);
    }

    // An agent that signalled done without committing decided there was nothing
    // to do; there is no diff to review and nothing to ship.
    const hasWork = await branchHasCommits(branch);

    if (done && hasWork) {
      await sandbox.run({
        name: "reviewer",
        maxIterations: 1,
        agent: sandcastle.claudeCode(MODEL),
        promptFile: PROMPTS.review,
        promptArgs: checkedPromptArgs(PROMPTS.review, {
          ...projectPromptArgs,
          BRANCH: branch,
          BASE_BRANCH,
        }),
      });

      // The reviewer commits too, which moves the tip. Both markers advance
      // together, or the next run would see a stale `implemented` and put an
      // agent back on work the reviewer just signed off.
      const tip = await tipOf(branch);
      if (tip) {
        await markPhase("implemented", leaf.id, tip);
        await markPhase("reviewed", leaf.id, tip);
      }
    }

    await trySetState(
      leaf.id,
      done && hasWork
        ? config.linear.reviewState
        : config.linear.unstartedState,
    );

    return done;
  } catch (cause) {
    await trySetState(leaf.id, config.linear.unstartedState);
    throw cause;
  } finally {
    await sandbox.close();
  }
}

async function planWaves(
  root: Root,
  remaining: Issue[],
  landed: string[],
): Promise<Issue[][]> {
  const plan = await sandcastle.run({
    hooks,
    sandbox: docker(),
    name: `planner-${root.issue.id}`,
    maxIterations: 1,
    agent: sandcastle.claudeCode(MODEL),
    promptFile: PROMPTS.plan,
    output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
    promptArgs: checkedPromptArgs(PROMPTS.plan, {
      BASE_BRANCH,
      ROOT_ID: root.issue.id,
      ROOT_TITLE: root.issue.title,
      REMAINING_ISSUES: JSON.stringify(
        remaining.map((leaf) => ({
          id: leaf.id,
          title: leaf.title,
          body: leaf.description,
          branch: leafBranch(leaf.id),
        })),
        null,
        2,
      ),
      LANDED_ISSUES: landed.length
        ? landed.map((id) => `- ${id}`).join("\n")
        : "_(none)_",
    }),
  });

  const byId = new Map(remaining.map((leaf) => [leaf.id, leaf]));
  const planned: z.infer<typeof planSchema> = plan.output;

  // The planner occasionally drops or invents an entry; trust our own leaf list.
  const seen = new Set<string>();
  const waves = planned.waves
    .map((wave) =>
      wave
        .map((entry) => byId.get(entry.id))
        .filter((leaf): leaf is Issue => {
          if (!leaf || seen.has(leaf.id)) return false;
          seen.add(leaf.id);
          return true;
        }),
    )
    .filter((wave) => wave.length > 0);

  const forgotten = remaining.filter((leaf) => !seen.has(leaf.id));
  if (forgotten.length > 0) waves.push(forgotten);

  return waves;
}

// ---------------------------------------------------------------------------
// Shipping
// ---------------------------------------------------------------------------

/** Root first, then the leaves — deduped, since a childless root is its own leaf. */
function issuesToClose(root: Root, worked: Issue[]): Issue[] {
  const seen = new Set<string>();
  return [root.issue, ...worked].filter((issue) => {
    if (seen.has(issue.id)) return false;
    seen.add(issue.id);
    return true;
  });
}

function pullRequestBody(root: Root, worked: Issue[]): string {
  const sections = [root.issue.description.trim() || `See ${root.issue.url}.`];

  sections.push(
    ["## Issues", ...worked.map((leaf) => `- ${leaf.id}: ${leaf.title}`)].join(
      "\n",
    ),
  );

  if (root.skippedLeaves.length > 0) {
    sections.push(
      [
        "## Not included",
        "These sub-issues were not eligible when this run started, so their work is not in this PR:",
        ...root.skippedLeaves.map(
          (leaf) => `- ${leaf.id}: ${leaf.title} (${leaf.stateName})`,
        ),
      ].join("\n"),
    );
  }

  sections.push(
    issuesToClose(root, worked)
      .map((issue) => `Closes ${issue.id}`)
      .join("\n"),
  );

  return sections.join("\n\n");
}

async function ship(root: Root, branches: string[], worked: Issue[]) {
  const branch = await nextIntegrationBranch(root.issue.id);
  console.log(`[${root.issue.id}] assembling ${branch}`);

  const sandbox = await sandcastle.createSandbox({
    branch,
    baseBranch: BASE_BRANCH,
    sandbox: docker(),
    hooks,
    copyToWorktree,
  });

  try {
    const integration = await sandbox.run({
      name: `integrator-${root.issue.id}`,
      maxIterations: 1,
      agent: sandcastle.claudeCode(MODEL),
      promptFile: PROMPTS.integrate,
      promptArgs: checkedPromptArgs(PROMPTS.integrate, {
        ...projectPromptArgs,
        ROOT_ID: root.issue.id,
        ROOT_TITLE: root.issue.title,
        INTEGRATION_BRANCH: branch,
        BASE_BRANCH,
        BRANCHES: branches.map((b) => `- ${b}`).join("\n"),
      }),
    });

    if (!signalledDone(integration)) {
      throw new Error(
        `integration of ${branch} did not complete — conflicts or failing tests left behind. Nothing pushed.`,
      );
    }
  } finally {
    await sandbox.close();
  }

  await pushBranch(branch);

  const url = await createPullRequest({
    branch,
    title: `${root.issue.id}: ${root.issue.title}`,
    body: pullRequestBody(root, worked),
  });

  const superseded = await supersedePreviousPrs(root.issue.id, branch, url);
  for (const number of superseded) {
    console.log(`[${root.issue.id}] closed superseded PR #${number}`);
  }

  for (const issue of issuesToClose(root, worked)) {
    await setState(issue.id, config.linear.reviewState);
  }

  return url;
}

// ---------------------------------------------------------------------------
// Per-root pipeline
// ---------------------------------------------------------------------------

async function runRoot(root: Root): Promise<string | null> {
  const { id } = root.issue;

  for (const leaf of root.skippedLeaves) {
    console.log(`[${id}] skipping ${leaf.id} — ${leaf.stateName}, not eligible`);
  }

  if (root.eligibleLeaves.length === 0) {
    console.log(
      `[${id}] 0 eligible issue (${root.skippedLeaves.length} leaf/leaves filtered out). Nothing to do.`,
    );
    return null;
  }

  await trySetState(id, config.linear.inProgressState);

  const landed = new Set<string>();

  for (let iteration = 1; iteration <= config.agent.retryRounds; iteration++) {
    const remaining = root.eligibleLeaves.filter((leaf) => !landed.has(leaf.id));
    if (remaining.length === 0) break;

    console.log(
      `\n[${id}] iteration ${iteration}/${config.agent.retryRounds} — ${remaining.length} issue(s) left`,
    );

    const waves = await planWaves(root, remaining, [...landed]);
    const landedBefore = landed.size;

    for (const [index, wave] of waves.entries()) {
      console.log(
        `[${id}] wave ${index + 1}/${waves.length}: ${wave.map((l) => l.id).join(", ")}`,
      );

      const settled = await Promise.allSettled(
        wave.map((leaf) => runLeaf(leaf, leafBranch(leaf.id))),
      );

      for (const [i, outcome] of settled.entries()) {
        const leaf = wave[i]!;
        if (outcome.status === "rejected") {
          console.error(`[${id}]   ✗ ${leaf.id}: ${outcome.reason}`);
        } else if (outcome.value) {
          landed.add(leaf.id);
        } else {
          console.error(`[${id}]   ✗ ${leaf.id}: ran out of iterations`);
        }
      }
    }

    if (landed.size === landedBefore) {
      console.log(`[${id}] no progress this iteration — giving up.`);
      break;
    }
  }

  const missing = root.eligibleLeaves.filter((leaf) => !landed.has(leaf.id));

  if (missing.length > 0) {
    console.error(
      `[${id}] incomplete — blocked on ${missing.map((l) => l.id).join(", ")}. No branch pushed, no PR opened.`,
    );
    return null;
  }

  const worked = root.eligibleLeaves;
  const mergeable = await Promise.all(
    worked.map(async (leaf) => ({
      branch: leafBranch(leaf.id),
      keep: await branchHasCommits(leafBranch(leaf.id)),
    })),
  );
  const branches = mergeable.filter((b) => b.keep).map((b) => b.branch);

  if (branches.length === 0) {
    console.log(`[${id}] every issue completed without producing commits.`);
    return null;
  }

  return ship(root, branches, worked);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const requested = parseArgs();
const rootIds = requested.length > 0 ? requested : await discoverRootIds();

if (rootIds.length === 0) {
  console.log("No eligible root issue. Nothing to do.");
  process.exit(0);
}

const roots = await Promise.all(rootIds.map(resolveRoot));
assertNoNesting(roots);

console.log(`Working ${roots.length} feature(s):`);
for (const root of roots) {
  console.log(
    `  ${root.issue.id}: ${root.issue.title} — ${root.eligibleLeaves.length} eligible, ${root.skippedLeaves.length} skipped`,
  );
}

const settled = await Promise.allSettled(roots.map(runRoot));

console.log("\n=== Summary ===");
for (const [i, outcome] of settled.entries()) {
  const { id } = roots[i]!.issue;
  if (outcome.status === "rejected") {
    console.error(`  ✗ ${id}: ${outcome.reason}`);
  } else if (outcome.value) {
    console.log(`  ✓ ${id}: ${outcome.value}`);
  } else {
    console.log(`  – ${id}: no pull request`);
  }
}
