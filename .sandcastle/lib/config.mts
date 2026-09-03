// Project configuration for the sandcastle orchestrator.
//
// Everything project-specific lives in `.sandcastle/config.json`. The schema
// below documents each field and supplies a default, so a new project only has
// to declare what actually differs.
//
// This layer assumes a Node project: the sandbox image (`.sandcastle/Dockerfile`)
// and the install hook are Node-shaped. A project on another toolchain needs its
// own Dockerfile and install command, not just a different config.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const SANDCASTLE_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

const effortSchema = z.enum(["low", "medium", "high", "xhigh", "max"]);

/** An unset field falls back to `agent.model` / `agent.effort`. */
const phaseAgentSchema = z
  .object({
    model: z.string().optional(),
    effort: effortSchema.optional(),
  })
  .default({});

export type PhaseAgent = { model: string; effort: z.infer<typeof effortSchema> };

const configSchema = z.object({
  linear: z.object({
    /** Linear project name. Omit to select on label + team alone. */
    project: z.string().nullable().default(null),
    /** Only issues carrying this label are eligible for agent work. */
    label: z.string().default("ready-for-agent"),
    /** Workflow state applied when an agent picks an issue up. */
    inProgressState: z.string().default("In Progress"),
    /** Workflow state applied once an issue's work is done and awaits review. */
    reviewState: z.string().default("In Review"),
    /** Workflow state an issue falls back to when its agent gives up. */
    unstartedState: z.string().default("Todo"),
  }),
  git: z.object({
    /** Remote to push integration branches to, and to resolve the GitHub repo from. */
    remote: z.string().default("origin"),
    /** Branch the work is based on, and the PR target. */
    baseBranch: z.string().default("main"),
    /** Prefix for per-issue working branches. Must be deterministic. */
    branchPrefix: z.string().default("sandcastle/issue-"),
    /**
     * Prefix for the per-root branch a wave is cut from: the base branch plus
     * everything landed so far. Rebuilt on every wave, never pushed.
     */
    waveBasePrefix: z.string().default("sandcastle/wave-base/"),
    /**
     * GitHub repo as `owner/name`. Derived from the remote URL when omitted —
     * pinning it matters in forks, where `gh` otherwise targets the upstream.
     */
    repo: z.string().nullable().default(null),
  }),
  agent: z.object({
    /** Fallback for any phase that declares no model of its own. */
    model: z.string().default("claude-opus-5"),
    /** Fallback reasoning effort, same rule as `model`. */
    effort: effortSchema.default("medium"),
    /**
     * Per-phase overrides. A phase reasons about different things: planning is
     * cheap and benefits from a fast model thinking hard, implementing is long
     * and benefits from the strongest model at a normal effort, reviewing is
     * short and benefits from both.
     */
    phases: z
      .object({
        plan: phaseAgentSchema,
        implement: phaseAgentSchema,
        review: phaseAgentSchema,
        integrate: phaseAgentSchema,
      })
      .default({ plan: {}, implement: {}, review: {}, integrate: {} }),
    /** Retry rounds per feature before giving up. */
    retryRounds: z.number().int().positive().default(10),
    /**
     * How many times a leaf whose *run* throws — a dead sandbox, a prompt that
     * would not expand — is re-run before the round gives up on it. Crashes are
     * usually transient; a round that ends on one costs a whole re-plan.
     */
    leafAttempts: z.number().int().positive().default(2),
    /**
     * How many times a merge agent is put back on a branch it left conflicted
     * or red — an integration branch, or a wave base the deterministic merge
     * could not assemble.
     */
    integrateAttempts: z.number().int().positive().default(3),
    /**
     * Iteration budget for one integration attempt. A merge agent that gets a
     * single pass has to resolve every conflict and fix the suite in one go,
     * which is how a half-merged branch gets signed off.
     */
    integrateIterations: z.number().int().positive().default(10),
    /** Iteration budget for a single issue's implementer. */
    implementIterations: z.number().int().positive().default(100),
    /**
     * An implementer that exhausts its iterations faster than this, with no
     * commit to show, was refused by the platform rather than beaten by the
     * task. See `lib/interruption.mts`.
     */
    quotaFastFailMs: z.number().int().positive().default(120_000),
  }),
  schedule: z
    .object({
      /**
       * Wall-clock budget for one leaf, implementer and reviewer together. The
       * real token sink is an agent looping on an impossible ticket; this is
       * what stops it. The leaf commits what it has and is retried next round.
       */
      leafTimeoutMinutes: z.number().positive().default(45),
      /**
       * Wall-clock budget for the whole run, under the cron period so two runs
       * never overlap. Reaching it is an interruption, not a failure.
       */
      runTimeoutMinutes: z.number().positive().default(240),
      /**
       * How long to stay away after an interruption that did not say when the
       * window reopens.
       */
      pauseMinutes: z.number().positive().default(60),
    })
    .prefault({}),
  sandbox: z.object({
    /** Run inside the sandbox once it is ready. */
    installCommand: z.string().default("npm install"),
    /** Host paths copied into each worktree, to avoid a cold install. */
    copyToWorktree: z.array(z.string()).default(["node_modules"]),
  }),
  project: z.object({
    /** Commands the agents must run before committing, and after each merge. */
    verifyCommands: z.array(z.string()).min(1).default(["npm test"]),
    /** Prefix every agent commit message starts with. */
    commitPrefix: z.string().default("RALPH:"),
    /** Coding standards the reviewer applies, as a path from the repo root. */
    codingStandardsFile: z.string().default(".sandcastle/CODING_STANDARDS.md"),
  }),
});

type RawConfig = z.infer<typeof configSchema>;

export type Config = Omit<RawConfig, "agent"> & {
  agent: Omit<RawConfig["agent"], "phases"> & {
    phases: Record<keyof RawConfig["agent"]["phases"], PhaseAgent>;
  };
};

/** `git@github.com:owner/repo.git` and `https://github.com/owner/repo.git` alike. */
function repoFromRemote(remote: string): string {
  const url = execFileSync("git", ["remote", "get-url", remote], {
    encoding: "utf8",
  }).trim();

  const match = url.match(/[:/]([^/:]+\/[^/]+?)(?:\.git)?$/);
  if (!match) {
    throw new Error(
      `Cannot derive owner/repo from remote "${remote}" (${url}). Set git.repo in .sandcastle/config.json.`,
    );
  }

  return match[1]!;
}

function load(): Config {
  const path = join(SANDCASTLE_DIR, "config.json");

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (cause) {
    throw new Error(`Cannot read ${path}: ${(cause as Error).message}`);
  }

  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid ${path}:\n${z.prettifyError(parsed.error)}`);
  }

  const config = parsed.data;
  const { model, effort, phases } = config.agent;

  const resolved = Object.fromEntries(
    Object.entries(phases).map(([phase, override]) => [
      phase,
      { model: override.model ?? model, effort: override.effort ?? effort },
    ]),
  ) as Record<keyof typeof phases, PhaseAgent>;

  return {
    ...config,
    agent: { ...config.agent, phases: resolved },
    git: {
      ...config.git,
      repo: config.git.repo ?? repoFromRemote(config.git.remote),
    },
  };
}

export const config = load();

/** Injected by sandcastle itself — passing them in `promptArgs` is an error. */
const BUILT_IN_PROMPT_ARGS = ["SOURCE_BRANCH", "TARGET_BRANCH"];

/**
 * Fail loudly on an unsubstituted `{{TOKEN}}`. Sandcastle leaves unknown
 * placeholders in the prompt verbatim, so a missed wiring reaches the agent as
 * literal braces and is never noticed.
 */
export function checkedPromptArgs(
  promptFile: string,
  args: Record<string, string>,
): Record<string, string> {
  const reserved = BUILT_IN_PROMPT_ARGS.filter((token) => token in args);
  if (reserved.length > 0) {
    throw new Error(
      `${promptFile}: ${reserved.join(", ")} ${reserved.length > 1 ? "are" : "is"} injected by sandcastle and cannot be passed as a prompt argument.`,
    );
  }

  const body = readFileSync(promptFile, "utf8");
  const tokens = new Set(
    [...body.matchAll(/\{\{([A-Z0-9_]+)\}\}/g)].map((m) => m[1]!),
  );

  const missing = [...tokens].filter(
    (token) => !(token in args) && !BUILT_IN_PROMPT_ARGS.includes(token),
  );
  if (missing.length > 0) {
    throw new Error(
      `${promptFile}: no value for ${missing.map((t) => `{{${t}}}`).join(", ")}`,
    );
  }

  return args;
}
