// Where a root picks its work back up.
//
// `baseBranch` used to answer two questions at once: what the pull request
// targets, and what the agents build on. They are not the same. The PR always
// targets the project's base branch; the agents have to build on whatever the
// previous attempt at this root already assembled, or its work is invisible to
// them and they redo — or fail to do — everything that depended on it.
//
// That previous attempt is discoverable: integration branches are named after
// the root. This module picks one, with no I/O of its own.

/** `ABC-1`, `ABC-1-2`, `ABC-1-3`, … — the integration branch family of a root. */
export function integrationBranchPattern(rootId: string): RegExp {
  return new RegExp(`^${rootId}(-\\d+)?$`);
}

/**
 * Which attempt a branch name represents, or null when it is not one of the
 * root's integration branches. The unsuffixed name is attempt 1.
 */
export function attemptNumber(rootId: string, branch: string): number | null {
  const match = branch.match(integrationBranchPattern(rootId));
  if (!match) return null;
  return match[1] ? Number(match[1].slice(1)) : 1;
}

export interface Candidate {
  /** The ref to hand to git — a local branch, or `origin/ABC-1-2`. */
  ref: string;
  attempt: number;
  isRemote: boolean;
}

/**
 * The root's integration branches among `refs`, newest attempt last. A local
 * branch wins over its remote twin: same attempt, and the local one is what a
 * worktree can be cut from without depending on the fetch being current.
 */
export function integrationCandidates(
  rootId: string,
  refs: string[],
  remote: string,
): Candidate[] {
  const byAttempt = new Map<number, Candidate>();

  for (const ref of refs) {
    const isRemote = ref.startsWith(`${remote}/`);
    const name = isRemote ? ref.slice(remote.length + 1) : ref;
    const attempt = attemptNumber(rootId, name);
    if (attempt === null) continue;

    const existing = byAttempt.get(attempt);
    if (!existing || (existing.isRemote && !isRemote)) {
      byAttempt.set(attempt, { ref, attempt, isRemote });
    }
  }

  return [...byAttempt.values()].sort((a, b) => a.attempt - b.attempt);
}

/**
 * The newest attempt that still carries work not in the base branch. An
 * attempt already merged into the base is not a resume point — its work is in
 * the base, and building on it would re-open commits the base already has.
 */
export async function pickResumeBase(
  rootId: string,
  options: {
    baseBranch: string;
    remote: string;
    refs: string[];
    /** True when `ref` is already contained in the base branch. */
    isMergedIntoBase(ref: string): Promise<boolean>;
  },
): Promise<string> {
  const candidates = integrationCandidates(rootId, options.refs, options.remote);

  for (const candidate of candidates.reverse()) {
    if (!(await options.isMergedIntoBase(candidate.ref))) return candidate.ref;
  }

  return options.baseBranch;
}

/**
 * Whether a leaf's work is already in the base the run is resuming from.
 *
 * Two states look alike from the outside and must not be confused: a leaf that
 * landed in an earlier attempt (branch with commits of its own, all of them
 * folded into the resume base) and a leaf that was attempted and produced
 * nothing (branch exists, no commits at all). The first is done; the second is
 * exactly the work this run exists to finish.
 */
export async function alreadyLanded(
  branch: string,
  options: {
    /** Commits of its own, measured against the project's base branch. */
    hasOwnWork(): Promise<boolean>;
    /** Whether the branch is fully contained in the resume base. */
    isContainedInResumeBase(): Promise<boolean>;
  },
): Promise<boolean> {
  if (!(await options.hasOwnWork())) return false;
  return options.isContainedInResumeBase();
}
