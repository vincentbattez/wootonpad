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
// A root that never completes ships what it has as a draft; the other roots
// are unaffected. Roots run one after another: they share one token quota, so
// running them side by side buys nothing and hides a closed window behind a
// burst of identical failures.
//
// Built to run from a cron with nobody watching. A run holds a lock, stops
// itself before the next tick, and when the platform cuts it off — the 5-hour
// window closing, a timeout — it records when to come back and leaves every
// issue exactly where it was (see lib/interruption.mts).

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { config, checkedPromptArgs } from "./lib/config.mts";
import {
  InterruptedError,
  asInterruption,
  looksLikeQuotaWall,
} from "./lib/interruption.mts";
import { createJournal } from "./lib/journal.mts";
import { createLock } from "./lib/lock.mts";
import { clearPhase, markPhase, phaseDone } from "./lib/progress.mts";
import { phaseError, phaseLog } from "./lib/log.mts";
import {
  branchHasCommits,
  buildWaveBase,
  commitAll,
  fetchRemote,
  isAncestor,
  listRefs,
  mergeBranches,
  rebaseLeafOnto,
  resetBranchTo,
  tipOf,
} from "./lib/git.mts";
import { fileIncident } from "./lib/incidents.mts";
import { alreadyLanded, pickResumeBase } from "./lib/resume.mts";
import {
  createPullRequest,
  nextIntegrationBranch,
  pushBranch,
  supersedePreviousPrs,
} from "./lib/github.mts";
import {
  BLOCKED_SIGNAL,
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
const SANDCASTLE_DIR = dirname(fileURLToPath(import.meta.url));
const MINUTE = 60_000;

const journal = createJournal(join(SANDCASTLE_DIR, "state"));

/**
 * Aborted when the run must stop as a whole — the global timeout, a SIGTERM
 * from the scheduler. Every agent run listens to it. The reason is always an
 * `InterruptedError`, so a leaf killed this way is reported as interrupted
 * and not as failed.
 */
const runController = new AbortController();

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () =>
    runController.abort(new InterruptedError(`${signal} received`)),
  );
}

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
  id: string,
  phase: "implement" | "integrate" = "implement",
): Promise<boolean> {
  for (const command of config.project.verifyCommands) {
    phaseLog(phase, `[${id}] verifying: ${command}`);

    const result = await sandbox.exec(command, {
      onLine: (line) => phaseLog(phase, `[${id}]   ${line}`),
    });

    if (result.exitCode !== 0) {
      phaseError(
        phase,
        `[${id}] ✗ ${command} failed (exit ${result.exitCode})\n${result.stderr}`,
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

  // A leaf whose work no longer merges into its base has been recut from it:
  // its markers describe a branch that no longer exists, so they go too.
  if ((await rebaseLeafOnto(branch, baseBranch)) === "restarted") {
    fileIncident({
      kind: "leaf-restarted",
      rootId: leaf.id,
      leafId: leaf.id,
      detail: `its work no longer merged into ${baseBranch} and was dropped`,
    });
    console.warn(
      `[${leaf.id}] its base moved under it and the merge conflicts — ` +
        `dropping the stale branch and re-implementing from ${baseBranch}`,
    );
    await clearPhase("implemented", leaf.id);
    await clearPhase("reviewed", leaf.id);
  }

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

  // The leaf's own budget, on top of the run's. Its expiry is a leaf timeout
  // (retried next round); the run's is an interruption (ends the run).
  const leafTimeout = AbortSignal.timeout(
    config.schedule.leafTimeoutMinutes * MINUTE,
  );
  const signal = AbortSignal.any([runController.signal, leafTimeout]);

  const sandbox = await sandcastle.createSandbox({
    branch,
    baseBranch,
    sandbox: docker(),
    hooks,
    copyToWorktree,
  });

  try {
    let completion: string | undefined = needsImplement
      ? undefined
      : COMPLETION_SIGNALS[0];

    if (needsImplement) {
      const started = Date.now();
      const implement = await sandbox.run({
        name: "implementer",
        maxIterations: config.agent.implementIterations,
        agent: agentFor("implement"),
        completionSignal: COMPLETION_SIGNALS,
        promptFile: PROMPTS.implement,
        signal,
        promptArgs: checkedPromptArgs(PROMPTS.implement, {
          ...projectPromptArgs,
          TASK_ID: leaf.id,
          ISSUE_TITLE: leaf.title,
          BRANCH: branch,
          BASE_BRANCH: baseBranch,
        }),
      });

      completion = implement.completionSignal;
      const durationMs = Date.now() - started;

      if (
        looksLikeQuotaWall({
          outcome: classifyOutcome(completion, implement.commits.length > 0),
          durationMs,
          committed: implement.commits.length > 0,
          fastFailMs: config.agent.quotaFastFailMs,
        })
      ) {
        throw new InterruptedError(
          `${leaf.id} exhausted ${config.agent.implementIterations} iterations in ` +
            `${Math.round(durationMs / 1000)}s with no commit — the platform is refusing us`,
        );
      }

      const tip = await tipOf(branch);
      if (completion && tip) await markPhase("implemented", leaf.id, tip, baseTip);
    } else {
      phaseLog("review", `[${leaf.id}] already implemented — reviewing only`);
    }

    let outcome = classifyOutcome(
      completion,
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
        signal,
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
    // Whatever stopped the agent, its uncommitted work goes on the branch
    // first: resumption reads git, and a killed sandbox is the one place work
    // gets lost otherwise.
    if (signal.aborted) {
      const committed = await commitAll(
        sandbox.worktreePath,
        `${config.project.commitPrefix} checkpoint — agent stopped by the orchestrator`,
      ).catch(() => false);
      if (committed) console.log(`[${leaf.id}] committed what the agent had`);
    }

    // The leaf's own timeout is a retry, not a verdict: an agent looping on a
    // ticket for 45 minutes is the token sink this budget exists to cap, and
    // the next round gets it with whatever it committed.
    if (leafTimeout.aborted && !runController.signal.aborted) {
      fileIncident({
        kind: "leaf-timeout",
        rootId: leaf.id,
        leafId: leaf.id,
        detail: `stopped after ${config.schedule.leafTimeoutMinutes} minutes`,
      });
      console.error(
        `[${leaf.id}] stopped after ${config.schedule.leafTimeoutMinutes} minutes — retried next round`,
      );
      return "exhausted";
    }

    // An interruption leaves the issue `In Progress`. That is true — the work
    // is on a branch and will resume — and dropping it to `Todo` here would
    // erase the only visible trace that something is in flight.
    const interruption = asInterruption(cause);
    if (interruption) throw interruption;

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
    signal: runController.signal,
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

/** A branch missing a leaf, or one the integrator never got green, ships as a draft. */
const isDraft = (missing: Issue[], assembled: boolean): boolean =>
  !assembled || missing.length > 0;

function pullRequestBody(
  root: Root,
  worked: Issue[],
  missing: Issue[],
  assembled: boolean,
): string {
  const sections = [root.issue.description.trim() || `See ${root.issue.url}.`];

  if (!assembled) {
    sections.push(
      "> **The integration never finished.** The integrator was put back on this " +
        "branch until its attempts ran out and still left conflicts or a red " +
        "suite behind. Everything below landed; the branch itself is not green.",
    );
  }

  sections.push(
    ["## Issues", ...worked.map((leaf) => `- ${leaf.id}: ${leaf.title}`)].join(
      "\n",
    ),
  );

  if (missing.length > 0) {
    sections.push(
      [
        "## Still open",
        "These sub-issues never landed, so this branch is a partial feature:",
        ...missing.map((leaf) => `- ${leaf.id}: ${leaf.title}`),
      ].join("\n"),
    );
  }

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

  // A draft closes the leaves it carries, never the root — whether the feature
  // is incomplete or the branch is red, saying "Closes <epic>" on it is how
  // work goes missing.
  const closes = isDraft(missing, assembled)
    ? worked
    : issuesToClose(root, worked);
  if (closes.length > 0) {
    sections.push(closes.map((issue) => `Closes ${issue.id}`).join("\n"));
  }

  return sections.join("\n\n");
}

const asList = (branches: string[]) =>
  branches.length ? branches.map((b) => `- ${b}`).join("\n") : "_(none)_";

/**
 * What a merge agent came back with. `blocked` is the agent saying the
 * conflict is semantic — two leaves made incompatible decisions — which no
 * further attempt will settle; only a human does.
 */
type Integration = "done" | "blocked" | "exhausted";

/**
 * Finish an integration the deterministic merge could not: `merged` already
 * applied cleanly, `pending` is what is left, starting with the one that
 * conflicted — or nothing, when every merge applied and the suite is red.
 * Every caller has its own fallback for anything but `done`; none of them
 * can afford to stop the run there.
 */
async function integrateWithAgent(
  sandbox: sandcastle.Sandbox,
  options: {
    name: string;
    rootId: string;
    rootTitle: string;
    base: string;
    merged: string[];
    pending: string[];
  },
): Promise<Integration> {
  const run = await sandbox.run({
    name: options.name,
    maxIterations: config.agent.integrateIterations,
    agent: agentFor("integrate"),
    completionSignal: COMPLETION_SIGNALS,
    promptFile: PROMPTS.integrate,
    signal: runController.signal,
    promptArgs: checkedPromptArgs(PROMPTS.integrate, {
      ...projectPromptArgs,
      ROOT_ID: options.rootId,
      ROOT_TITLE: options.rootTitle,
      INTEGRATION_BRANCH: sandbox.branch,
      BASE_BRANCH: options.base,
      MERGED_BRANCHES: asList(options.merged),
      BRANCHES: asList(options.pending),
    }),
  });

  if (run.completionSignal === undefined) return "exhausted";
  return run.completionSignal.includes(BLOCKED_SIGNAL) ? "blocked" : "done";
}

/** A sandbox on `branch` for the duration of `fn`, closed whatever happens. */
async function withSandbox<T>(
  branch: string,
  base: string,
  fn: (sandbox: sandcastle.Sandbox) => Promise<T>,
): Promise<T> {
  const sandbox = await sandcastle.createSandbox({
    branch,
    baseBranch: base,
    sandbox: docker(),
    hooks,
    copyToWorktree,
  });
  try {
    return await fn(sandbox);
  } finally {
    await sandbox.close();
  }
}

/**
 * The branch a wave is cut from. The deterministic merge is the answer for the
 * case this run is designed around — leaves that touch different code — and a
 * conflict means the plan was wrong. Being wrong is not a reason to stop: an
 * agent gets the same merge, and if it cannot assemble one either the wave
 * simply runs on the resume base. A wave with less context beats no wave.
 */
async function waveBaseFor(
  root: Root,
  resumeBase: string,
  branches: string[],
): Promise<string> {
  const { id, title } = root.issue;
  const branch = `${config.git.waveBasePrefix}${id}`;

  try {
    return await buildWaveBase(branch, resumeBase, branches);
  } catch (cause) {
    phaseError("integrate", `[${id}] ${(cause as Error).message}`);
  }

  phaseLog("integrate", `[${id}] handing ${branch} to an agent to assemble`);

  for (let attempt = 1; attempt <= config.agent.integrateAttempts; attempt++) {
    // Each attempt starts from the base again: a half-merged wave base is worse
    // than an unmerged one, and unlike an integration branch nothing downstream
    // has seen it yet.
    await resetBranchTo(branch, resumeBase);

    const result = await withSandbox(branch, resumeBase, (sandbox) =>
      integrateWithAgent(sandbox, {
        name: `wave-base-${id}`,
        rootId: id,
        rootTitle: title,
        base: resumeBase,
        merged: [],
        pending: branches,
      }),
    );

    if (result === "done") return branch;
    if (result === "blocked") break;

    phaseError(
      "integrate",
      `[${id}] ${branch} unfinished — attempt ${attempt}/${config.agent.integrateAttempts}`,
    );
  }

  fileIncident({
    kind: "wave-base-escalated",
    rootId: id,
    detail: `no agent could assemble ${branch} from ${branches.join(", ")}; the wave ran on ${resumeBase}`,
  });

  phaseError(
    "integrate",
    `[${id}] ${branch} could not be assembled — the wave runs on ${resumeBase}, ` +
      `without the code its earlier leaves landed`,
  );
  return resumeBase;
}

async function ship(
  root: Root,
  branches: string[],
  worked: Issue[],
  resumeBase: string,
  missing: Issue[],
) {
  const { id, title } = root.issue;
  const branch = await nextIntegrationBranch(id);
  phaseLog("integrate", `[${id}] assembling ${branch} from ${resumeBase}`);

  // Cut from the resume base so the attempt keeps what earlier ones landed,
  // even when this run's leaves were all no-ops. The pull request still targets
  // the project's base branch — that is what `baseBranch` means for a PR.
  //
  // The merge itself is `git merge` in a loop: leaves that touch different
  // code assemble without judgement and without tokens. An agent is called
  // only for what the loop could not do — the merge that conflicted, or a
  // suite that went red once everything applied — and each attempt resumes
  // the same branch, so a second integrator picks up where the first stopped.
  await resetBranchTo(branch, resumeBase);
  const conflict = await mergeBranches(branch, branches);
  const merged = conflict ? branches.slice(0, branches.indexOf(conflict)) : branches;
  const pending = conflict ? branches.slice(branches.indexOf(conflict)) : [];

  const assembled = await withSandbox(branch, resumeBase, async (sandbox) => {
    if (!conflict && (await verifyBranch(sandbox, id, "integrate"))) return true;

    fileIncident({
      kind: "integration-escalated",
      rootId: id,
      detail: conflict
        ? `merging ${conflict} into ${branch} conflicts`
        : `${branch} merges cleanly but the suite is red`,
    });
    phaseError(
      "integrate",
      `[${id}] ${conflict ? `${conflict} conflicts` : "the suite is red"} — handing ${branch} to an agent`,
    );

    for (let attempt = 1; attempt <= config.agent.integrateAttempts; attempt++) {
      if (attempt > 1) {
        phaseError(
          "integrate",
          `[${id}] integration of ${branch} unfinished — attempt ${attempt}/${config.agent.integrateAttempts}`,
        );
      }

      const result = await integrateWithAgent(sandbox, {
        name: `integrator-${id}`,
        rootId: id,
        rootTitle: title,
        base: resumeBase,
        merged,
        pending,
      });
      if (result === "done") return true;
      if (result === "blocked") {
        phaseError(
          "integrate",
          `[${id}] the agent reports a semantic conflict on ${branch} — a human call`,
        );
        return false;
      }
    }

    return false;
  });

  // An unfinished integration still ships: a draft PR carrying what landed is
  // reviewable and fixable, and is the only outcome that does not need someone
  // to notice the run and start it again.
  const draft = isDraft(missing, assembled);

  if (draft) {
    fileIncident({
      kind: "shipped-incomplete",
      rootId: id,
      detail: assembled
        ? `${missing.map((leaf) => leaf.id).join(", ")} never landed`
        : `the integrator left ${branch} conflicted or red after ${config.agent.integrateAttempts} attempts`,
    });
  }

  await pushBranch(branch);

  const url = await createPullRequest({
    branch,
    title: `${id}: ${title}`,
    body: pullRequestBody(root, worked, missing, assembled),
    draft,
  });

  const superseded = await supersedePreviousPrs(id, branch, url);
  for (const number of superseded) {
    console.log(`[${id}] closed superseded PR #${number}`);
  }

  // A draft closes nothing: every leaf that landed was moved to `In Review` by
  // its own run, and moving the root there would say the feature is done when
  // it is not.
  if (!draft) {
    for (const issue of issuesToClose(root, worked)) {
      await setState(issue.id, config.linear.reviewState);
    }
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
    baseFor: (branches: string[]) => waveBaseFor(root, resumeBase, branches),
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
      leafAttempts: config.agent.leafAttempts,
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

  const worked = root.eligibleLeaves.filter((leaf) =>
    isSettled(settled.get(leaf.id) ?? "exhausted"),
  );

  if (missing.length > 0) {
    console.error(
      `[${id}] incomplete — ${missing
        .map((leaf) => `${leaf.id} (${settled.get(leaf.id) ?? "never ran"})`)
        .join(", ")}.`,
    );

    // What landed is worth shipping on its own: the next run resumes from the
    // integration branch, so a draft PR is both the review surface and the base
    // the missing leaves get re-attempted on.
    if (landedBranches.length === 0) {
      console.error(`[${id}] nothing landed either. No branch pushed.`);
      return null;
    }

    console.error(`[${id}] shipping what landed as a draft pull request.`);
    return ship(root, landedBranches, worked, resumeBase, missing);
  }

  if (landedBranches.length === 0) {
    console.log(`[${id}] every issue completed without producing commits.`);
    return null;
  }

  return ship(root, landedBranches, root.eligibleLeaves, resumeBase, []);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const startedAt = new Date();

const lock = createLock({ path: join(SANDCASTLE_DIR, "lock") });
const holder = lock.acquire();
if (holder) {
  console.log(
    `Another run holds the lock (pid ${holder.pid}, since ${holder.startedAt}). Exiting.`,
  );
  process.exit(0);
}
process.on("exit", () => lock.release());

const pause = journal.activePause(startedAt);
if (pause) {
  console.log(`Paused until ${pause.until} — ${pause.reason}. Exiting.`);
  process.exit(0);
}

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

const runTimer = setTimeout(
  () =>
    runController.abort(
      new InterruptedError(
        `run budget of ${config.schedule.runTimeoutMinutes} minutes spent`,
      ),
    ),
  config.schedule.runTimeoutMinutes * MINUTE,
);
runTimer.unref();

type RootReport = { id: string; pullRequest: string | null; outcome: string };
const reports: RootReport[] = [];
let interruption: InterruptedError | null = null;

for (const root of roots) {
  const { id } = root.issue;
  try {
    const url = await runRoot(root);
    reports.push({ id, pullRequest: url, outcome: url ? "shipped" : "nothing" });
  } catch (cause) {
    interruption = asInterruption(cause);
    if (interruption) {
      reports.push({ id, pullRequest: null, outcome: "interrupted" });
      break;
    }
    reports.push({ id, pullRequest: null, outcome: `failed: ${cause}` });
  }
}

clearTimeout(runTimer);

if (interruption) {
  const until =
    interruption.resumeAfter ??
    new Date(Date.now() + config.schedule.pauseMinutes * MINUTE);
  journal.pauseUntil(until, interruption.reason);
  console.error(
    `\nInterrupted — ${interruption.reason}. Back after ${until.toISOString()}.`,
  );
}

journal.recordRun({
  startedAt: startedAt.toISOString(),
  endedAt: new Date().toISOString(),
  roots: reports,
  ...(interruption ? { interrupted: interruption.reason } : {}),
});

console.log("\n=== Summary ===");
for (const report of reports) {
  if (report.pullRequest) {
    console.log(`  ✓ ${report.id}: ${report.pullRequest}`);
  } else if (report.outcome.startsWith("failed")) {
    console.error(`  ✗ ${report.id}: ${report.outcome}`);
  } else {
    console.log(`  – ${report.id}: ${report.outcome}`);
  }
}
for (const root of roots.slice(reports.length)) {
  console.log(`  – ${root.issue.id}: not started`);
}

process.exit(reports.some((r) => r.outcome.startsWith("failed")) ? 1 : 0);
