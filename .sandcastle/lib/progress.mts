// What a leaf's branch has already been through, across runs.
//
// The orchestrator keeps no state between runs, so re-running a feature used to
// redo work an agent had already finished. Each completed phase is recorded as
// a git ref pointing at the branch tip it was completed on: the tip moves, the
// ref goes stale, the phase runs again. A ref matching the tip means there is
// nothing left to do — no sandbox, no agent, no tokens.
//
// Refs live under `refs/sandcastle/`, outside `refs/heads` and `refs/tags`, so
// they never show up in `git branch` and are never pushed.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export type Phase = "implemented" | "reviewed";

const refName = (phase: Phase, id: string) => `refs/sandcastle/${phase}/${id}`;

async function resolve(rev: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--verify", rev]);
    return stdout.trim();
  } catch {
    return null;
  }
}

/** The branch's current commit, or null when the branch doesn't exist yet. */
export const tipOf = (branch: string) => resolve(branch);

export async function phaseDone(
  phase: Phase,
  id: string,
  tip: string,
): Promise<boolean> {
  return (await resolve(refName(phase, id))) === tip;
}

export async function markPhase(
  phase: Phase,
  id: string,
  tip: string,
): Promise<void> {
  await exec("git", ["update-ref", refName(phase, id), tip]);
}
