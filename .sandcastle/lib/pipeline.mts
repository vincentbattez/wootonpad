// The orchestrator's decision logic, with every I/O dependency injected.
//
// Nothing here touches git, Docker or Linear, so the rules that decide whether
// a leaf landed — and what a wave is cut from — are testable without a sandbox.

/** Emitted by an agent that finished the task. */
export const COMPLETE_SIGNAL = "<promise>COMPLETE</promise>";

/**
 * Emitted by an agent that stopped on purpose without finishing. Without it, a
 * clean give-up is indistinguishable from a success: the agent returns
 * normally, a completion signal exists, and the leaf counts as landed with an
 * empty branch.
 */
export const BLOCKED_SIGNAL = "<promise>BLOCKED</promise>";

export const COMPLETION_SIGNALS = [COMPLETE_SIGNAL, BLOCKED_SIGNAL];

export type Outcome =
  /** Finished and committed. */
  | "landed"
  /** Finished and decided there was nothing to commit. Settled, not retried. */
  | "empty"
  /** Said so itself: prerequisites missing, spec unclear, out of its depth. */
  | "blocked"
  /** Never signalled — ran out of iterations. */
  | "exhausted"
  /** The run itself threw. */
  | "failed";

/** Settled outcomes are done with; the rest are worth another round. */
export const isSettled = (outcome: Outcome): boolean =>
  outcome === "landed" || outcome === "empty";

/**
 * `hasWork` alone cannot decide this: a ticket that is legitimately a no-op
 * never commits, and treating "no commit" as failure would retry it until the
 * whole feature gives up. The signal says what the agent meant; `hasWork` says
 * what it produced. Both are needed.
 */
export function classifyOutcome(
  signal: string | undefined,
  hasWork: boolean,
): Outcome {
  if (signal === undefined) return "exhausted";
  if (signal.includes(BLOCKED_SIGNAL)) return "blocked";
  return hasWork ? "landed" : "empty";
}

/**
 * The reviewer fixes what it finds and signs off in one pass — there is no
 * review/fix loop. What matters is that it says so: a reviewer that stops
 * without signalling has left an unknown amount of its own work behind, and
 * marking that tip `reviewed` would sign off on a review that never happened.
 */
export function classifyReview(signal: string | undefined): Outcome {
  if (signal === undefined) return "exhausted";
  if (signal.includes(BLOCKED_SIGNAL)) return "blocked";
  return "landed";
}

export interface Leaf {
  id: string;
}

/**
 * The planner occasionally drops or invents an entry; trust our own leaf list.
 * Anything it forgot is appended as a final wave rather than silently dropped.
 */
export function normalizeWaves<T extends Leaf>(
  planned: { id: string }[][],
  remaining: T[],
): T[][] {
  const byId = new Map(remaining.map((leaf) => [leaf.id, leaf]));
  const seen = new Set<string>();

  const waves = planned
    .map((wave) =>
      wave
        .map((entry) => byId.get(entry.id))
        .filter((leaf): leaf is T => {
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

export interface WaveDeps<T extends Leaf> {
  /** Run one leaf against the base its wave is cut from. */
  runLeaf(leaf: T, branch: string, baseBranch: string): Promise<Outcome>;
  /** Branch carrying the base plus every branch landed so far, in order. */
  baseFor(landedBranches: string[]): Promise<string>;
  branchOf(id: string): string;
  log(message: string): void;
  logError(message: string): void;
}

export interface WaveResult {
  outcomes: Map<string, Outcome>;
  /** Landed branches, in landing order — the order `ship()` must merge them. */
  landedBranches: string[];
}

/**
 * Run waves in order, each cut from the accumulated result of the ones before
 * it. This is the whole point of a wave: a leaf that depends on an earlier
 * leaf's code must be able to see that code, and until the base is chained the
 * waves only ordered execution, not the tree the agents read.
 */
export async function runWaves<T extends Leaf>(
  deps: WaveDeps<T>,
  options: { rootId: string; waves: T[][]; landedBranches?: string[] },
): Promise<WaveResult> {
  const { rootId, waves } = options;
  const landedBranches = [...(options.landedBranches ?? [])];
  const outcomes = new Map<string, Outcome>();

  for (const [index, wave] of waves.entries()) {
    const base = await deps.baseFor(landedBranches);

    deps.log(
      `[${rootId}] wave ${index + 1}/${waves.length} on ${base}: ${wave
        .map((leaf) => leaf.id)
        .join(", ")}`,
    );

    const settled = await Promise.allSettled(
      wave.map((leaf) => deps.runLeaf(leaf, deps.branchOf(leaf.id), base)),
    );

    for (const [i, result] of settled.entries()) {
      const leaf = wave[i]!;

      if (result.status === "rejected") {
        outcomes.set(leaf.id, "failed");
        deps.logError(`[${rootId}]   ✗ ${leaf.id} failed: ${result.reason}`);
        continue;
      }

      outcomes.set(leaf.id, result.value);

      switch (result.value) {
        case "landed":
          landedBranches.push(deps.branchOf(leaf.id));
          break;
        case "empty":
          deps.log(`[${rootId}]   – ${leaf.id}: nothing to commit`);
          break;
        case "blocked":
          deps.logError(`[${rootId}]   ✗ ${leaf.id}: blocked`);
          break;
        case "exhausted":
          deps.logError(`[${rootId}]   ✗ ${leaf.id}: ran out of iterations`);
          break;
      }
    }
  }

  return { outcomes, landedBranches };
}
