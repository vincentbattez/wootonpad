// Ordering leaves into waves from declared dependencies — no agent involved.
//
// A wave is a set of leaves with nothing between them; wave N runs on top of
// everything waves 1..N-1 landed. Given `blocks` relations that is a layered
// topological sort, exact and free. The AI planner is the fallback for a root
// whose tracker declares nothing, and its job is to *produce* relations, so
// that the next run is deterministic (ADR 0013).

export interface Dependent {
  id: string;
  /** Identifiers of what must land before this one. */
  blockedBy: string[];
}

export class DependencyCycleError extends Error {
  readonly ids: string[];

  constructor(ids: string[]) {
    super(`dependency cycle among ${ids.join(", ")}`);
    this.name = "DependencyCycleError";
    this.ids = ids;
  }
}

/** Whether at least one leaf declares a blocker among the others. */
export function hasDeclaredRelations<T extends Dependent>(leaves: T[]): boolean {
  const ids = new Set(leaves.map((leaf) => leaf.id));
  return leaves.some((leaf) => leaf.blockedBy.some((id) => ids.has(id)));
}

/**
 * Layer `leaves` by their blockers. Blockers outside `leaves` are taken as
 * satisfied — they landed in an earlier round, or the caller filtered the
 * leaf out already. Throws on a cycle: that is a tracker error, and the
 * right answer is to say so rather than pick an order.
 */
export function wavesFromRelations<T extends Dependent>(leaves: T[]): T[][] {
  const ids = new Set(leaves.map((leaf) => leaf.id));
  const pending = new Map(
    leaves.map((leaf) => [
      leaf.id,
      { leaf, blockers: new Set(leaf.blockedBy.filter((id) => ids.has(id))) },
    ]),
  );
  const waves: T[][] = [];

  while (pending.size > 0) {
    const ready = [...pending.values()].filter(({ blockers }) => blockers.size === 0);
    if (ready.length === 0) throw new DependencyCycleError([...pending.keys()]);

    waves.push(ready.map(({ leaf }) => leaf));
    for (const { leaf } of ready) {
      pending.delete(leaf.id);
      for (const entry of pending.values()) entry.blockers.delete(leaf.id);
    }
  }

  return waves;
}

/**
 * What the AI planner inferred, kept to the leaves it was asked about: an
 * invented id is dropped, a leaf it forgot has no blockers, and a self-block
 * is ignored. Deduped, so the tracker gets each relation once.
 */
export function normalizeDependencies<T extends { id: string }>(
  inferred: { id: string; blockedBy: string[] }[],
  leaves: T[],
): (T & Dependent)[] {
  const ids = new Set(leaves.map((leaf) => leaf.id));
  const byId = new Map(inferred.map((entry) => [entry.id, entry.blockedBy]));

  return leaves.map((leaf) => ({
    ...leaf,
    blockedBy: [
      ...new Set(
        (byId.get(leaf.id) ?? []).filter((id) => ids.has(id) && id !== leaf.id),
      ),
    ],
  }));
}
