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
//   2. Execute  — one sandbox per leaf. Waves run in order, leaves inside a
//                 wave run concurrently. Wave N is cut from the base branch
//                 plus everything landed in waves 1..N-1, so a leaf can build
//                 on the code its wave order says it depends on.
//                 Implementer, then reviewer if the implementer committed.
//   3. Retry    — up to `agent.retryRounds` rounds, re-planning what is left.
//   4. Ship     — only when every eligible leaf landed: an agent assembles the
//                 integration branch, then the host pushes it and opens a PR.
//
// A root that never completes ships nothing; the other roots are unaffected.

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { z } from "zod";
import { config, checkedPromptArgs } from "./lib/config.mts";
import { clearPhase, markPhase, phaseDone } from "./lib/progress.mts";
import { phaseError, phaseLog } from "./lib/log.mts";
import {
  branchHasCommits,
  buildWaveBase,
  fetchRemote,
  isAncestor,
  listRefs,
  rebaseLeafOnto,
  tipOf,
} from "./lib/git.mts";
import { alreadyLanded, pickResumeBase } from "./lib/resume.mts";
import {
  createPullRequest,
  nextIntegrationBranch,
  pushBranch,
  supersedePreviousPrs,
} from "./lib/github.mts";
import {
  COMPLETION_SIGNALS,
  classifyOutcome,
  classifyReview,
  isSettled,
  normalizeWaves,
  runWaves,
  type Outcome,
} from "./lib/pipeline.mts";
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

const BASE_BRANCH = config.git.baseBranch;

/** Each phase runs on the model and effort its own config entry declares. */
const agentFor = (phase: keyof typeof config.agent.phases) => {
  const { model, effort } = config.agent.phases[phase];
  return sandcastle.claudeCode(model, { effort });
};

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
 * Each phase runs only if its marker is stale, so a re-run picks up where the
 * last one stopped: implement what was never implemented, review what the
 * implementer changed since the last review, skip a leaf that is settled.
 *
 * `baseBranch` is the wave's cumulative base, not the project's base branch —
 * every judgement below (is there work? is the marker still valid?) is relative
 * to it.
 */
/**
 * The reviewer gets a single pass and has to sign off on the branch it is
 * handed, so it must start from a green suite: a failure it did not cause
 * either eats that pass or gets signed off with the branch. Running the
 * project's own feedback loops here keeps that from ever reaching it.
 */
async function verifyBranch(
  sandbox: sandcastle.Sandbox,
  leafId: string,
): Promise<boolean> {
  for (const command of config.project.verifyCommands) {
    phaseLog("implement", `[${leafId}] verifying: ${command}`);

    const result = await sandbox.exec(command, {
      onLine: (line) => phaseLog("implement", `[${leafId}]   ${line}`),
    });

    if (result.exitCode !== 0) {
      phaseError(
        "implement",
        `[${leafId}] ✗ ${command} failed (exit ${result.exitCode})\n${result.stderr}`,
      );
      return false;
    }
  }

  return true;
}

async function runLeaf(
  leaf: Issue,
  branch: string,
  baseBranch: string,
): Promise<Outcome> {
  // Work an earlier attempt already folded into the base needs no agent. A
  // branch that exists but never produced anything is not that — it is the
  // work this run is here to finish.
  const landedEarlier = await alreadyLanded(branch, {
    hasOwnWork: () => branchHasCommits(branch, BASE_BRANCH),
    isContainedInResumeBase: () => isAncestor(branch, baseBranch),
  });

  if (landedEarlier) {
    console.log(`[${leaf.id}] already in ${baseBranch} — skipping`);
    return "empty";
  }

  await rebaseLeafOnto(branch, baseBranch);

  const baseTip = await tipOf(baseBranch);
  const existing = await tipOf(branch);
  const needsImplement =
    existing === null ||
    !(await phaseDone("implemented", leaf.id, existing, baseTip));
  const needsReview =
    needsImplement ||
    (existing !== null &&
      !(await phaseDone("reviewed", leaf.id, existing, baseTip)));

  if (!needsImplement && !needsReview) {
    console.log(`[${leaf.id}] implemented and reviewed already — skipping`);
    return (await branchHasCommits(branch, baseBranch)) ? "landed" : "empty";
  }

  await trySetState(leaf.id, config.linear.inProgressState);

  const sandbox = await sandcastle.createSandbox({
    branch,
    baseBranch,
    sandbox: docker(),
    hooks,
    copyToWorktree,
  });

  try {
    let signal: string | undefined = needsImplement
      ? undefined
      : COMPLETION_SIGNALS[0];

    if (needsImplement) {
      const implement = await sandbox.run({
        name: "implementer",
        maxIterations: config.agent.implementIterations,
        agent: agentFor("implement"),
        completionSignal: COMPLETION_SIGNALS,
        promptFile: PROMPTS.implement,
        promptArgs: checkedPromptArgs(PROMPTS.implement, {
          ...projectPromptArgs,
          TASK_ID: leaf.id,
          ISSUE_TITLE: leaf.title,
          BRANCH: branch,
          BASE_BRANCH: baseBranch,
        }),
      });

      signal = implement.completionSignal;
      const tip = await tipOf(branch);
      if (signal && tip) await markPhase("implemented", leaf.id, tip, baseTip);
    } else {
      phaseLog("review", `[${leaf.id}] already implemented — reviewing only`);
    }

    let outcome = classifyOutcome(
      signal,
      await branchHasCommits(branch, baseBranch),
    );

    // A branch whose feedback loops fail is not review material — it goes back
    // for another implement round, which means dropping the markers a resume
    // would otherwise read as "implemented, review only".
    if (outcome === "landed" && !(await verifyBranch(sandbox, leaf.id))) {
      await clearPhase("implemented", leaf.id);
      await clearPhase("reviewed", leaf.id);
      outcome = "blocked";
    }

    if (outcome === "landed") {
      const review = await sandbox.run({
        name: "reviewer",
        maxIterations: 1,
        agent: agentFor("review"),
        completionSignal: COMPLETION_SIGNALS,
        promptFile: PROMPTS.review,
        promptArgs: checkedPromptArgs(PROMPTS.review, {
          ...projectPromptArgs,
          BRANCH: branch,
          // The prompt's `git diff` runs *inside* the sandbox, where a
          // host-only branch name like the wave base may not resolve. The
          // commit it points at is reachable from the leaf branch (the rebase
          // above merged it in), so a sha always does.
          BASE_REV: baseTip ?? baseBranch,
        }),
      });

      outcome = classifyReview(review.completionSignal);

      // The reviewer commits too, which moves the tip. Both markers advance
      // together, or the next run would see a stale `implemented` and put an
      // agent back on work the reviewer just signed off. Only a reviewer that
      // signed off gets to advance them.
      const tip = await tipOf(branch);
      if (outcome === "landed" && tip) {
        await markPhase("implemented", leaf.id, tip, baseTip);
        await markPhase("reviewed", leaf.id, tip, baseTip);
      }
    }

    await trySetState(
      leaf.id,
      outcome === "landed"
        ? config.linear.reviewState
        : config.linear.unstartedState,
    );

    return outcome;
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
  resumeBase: string,
): Promise<Issue[][]> {
  phaseLog(
    "plan",
    `[${root.issue.id}] planning ${remaining.length} issue(s) on ${resumeBase}`,
  );

  const plan = await sandcastle.run({
    hooks,
    sandbox: docker(),
    name: `planner-${root.issue.id}`,
    maxIterations: 1,
    agent: agentFor("plan"),
    promptFile: PROMPTS.plan,
    output: sandcastle.Output.object({ tag: "plan", schema: planSchema }),
    promptArgs: checkedPromptArgs(PROMPTS.plan, {
      BASE_BRANCH: resumeBase,
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

  const planned: z.infer<typeof planSchema> = plan.output;
  return normalizeWaves(planned.waves, remaining);
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

async function ship(
  root: Root,
  branches: string[],
  worked: Issue[],
  resumeBase: string,
) {
  const branch = await nextIntegrationBranch(root.issue.id);
  phaseLog("integrate", `[${root.issue.id}] assembling ${branch} from ${resumeBase}`);

  // Cut from the resume base so the attempt keeps what earlier ones landed,
  // even when this run's leaves were all no-ops. The pull request still targets
  // the project's base branch — that is what `baseBranch` means for a PR.
  const sandbox = await sandcastle.createSandbox({
    branch,
    baseBranch: resumeBase,
    sandbox: docker(),
    hooks,
    copyToWorktree,
  });

  try {
    const integration = await sandbox.run({
      name: `integrator-${root.issue.id}`,
      maxIterations: 1,
      agent: agentFor("integrate"),
      promptFile: PROMPTS.integrate,
      promptArgs: checkedPromptArgs(PROMPTS.integrate, {
        ...projectPromptArgs,
        ROOT_ID: root.issue.id,
        ROOT_TITLE: root.issue.title,
        INTEGRATION_BRANCH: branch,
        BASE_BRANCH: resumeBase,
        BRANCHES: branches.map((b) => `- ${b}`).join("\n"),
      }),
    });

    if (integration.completionSignal === undefined) {
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

/**
 * Where this root picks up. An unmerged integration branch from a previous
 * attempt holds everything that already landed; starting from the project's
 * base branch instead would hide it from every agent — which is how the last
 * three issues of an epic came back empty, each reporting that the code they
 * depended on did not exist.
 */
async function resumeBaseOf(rootId: string): Promise<string> {
  const { remote } = config.git;
  await fetchRemote(remote);

  const base = await pickResumeBase(rootId, {
    baseBranch: BASE_BRANCH,
    remote,
    refs: await listRefs(remote),
    isMergedIntoBase: (ref) => isAncestor(ref, BASE_BRANCH),
  });

  console.log(
    base === BASE_BRANCH
      ? `[${rootId}] starting from ${BASE_BRANCH}`
      : `[${rootId}] resuming from ${base} — a previous attempt's work`,
  );

  return base;
}

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

  const resumeBase = await resumeBaseOf(id);

  const deps = {
    runLeaf,
    branchOf: leafBranch,
    baseFor: (branches: string[]) =>
      buildWaveBase(`${config.git.waveBasePrefix}${id}`, resumeBase, branches),
    log: (message: string) => console.log(message),
    logError: (message: string) => console.error(message),
  };

  const settled = new Map<string, Outcome>();
  let landedBranches: string[] = [];

  for (let iteration = 1; iteration <= config.agent.retryRounds; iteration++) {
    const remaining = root.eligibleLeaves.filter(
      (leaf) => !isSettled(settled.get(leaf.id) ?? "exhausted"),
    );
    if (remaining.length === 0) break;

    console.log(
      `\n[${id}] iteration ${iteration}/${config.agent.retryRounds} — ${remaining.length} issue(s) left`,
    );

    const settledIds = [...settled]
      .filter(([, outcome]) => isSettled(outcome))
      .map(([leafId]) => leafId);

    const waves = await planWaves(root, remaining, settledIds, resumeBase);
    const before = settledIds.length;

    const result = await runWaves(deps, {
      rootId: id,
      waves,
      landedBranches,
    });

    for (const [leafId, outcome] of result.outcomes) settled.set(leafId, outcome);
    landedBranches = result.landedBranches;

    const settledNow = [...settled.values()].filter(isSettled).length;
    if (settledNow === before) {
      console.log(`[${id}] no progress this iteration — giving up.`);
      break;
    }
  }

  const missing = root.eligibleLeaves.filter(
    (leaf) => !isSettled(settled.get(leaf.id) ?? "exhausted"),
  );

  if (missing.length > 0) {
    console.error(
      `[${id}] incomplete — ${missing
        .map((leaf) => `${leaf.id} (${settled.get(leaf.id) ?? "never ran"})`)
        .join(", ")}. No branch pushed, no PR opened.`,
    );
    return null;
  }

  if (landedBranches.length === 0) {
    console.log(`[${id}] every issue completed without producing commits.`);
    return null;
  }

  return ship(root, landedBranches, root.eligibleLeaves, resumeBase);
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
