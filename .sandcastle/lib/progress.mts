// What a leaf's branch has already been through, across runs.
//
// The orchestrator keeps no state between runs, so re-running a feature used to
// redo work an agent had already finished. Each completed phase is recorded as
// a pair of git refs: the branch tip it was completed on, and the tip of the
// base it was completed against. Either one moving invalidates the marker.
//
// The base half is what makes the markers survive wave chaining: the same
// branch reviewed on top of `main` has not been reviewed on top of
// `main + wave 1`. Recording only the branch tip would let a re-based leaf skip
// a review it never had.
//
// Refs live under `refs/sandcastle/`, outside `refs/heads` and `refs/tags`, so
// they never show up in `git branch` and are never pushed.

import { execFile } from "node:child_process";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);

export type Phase = "implemented" | "reviewed";

const refName = (phase: Phase, id: string, kind: "tip" | "base") =>
  kind === "tip"
    ? `refs/sandcastle/${phase}/${id}`
    : `refs/sandcastle/${phase}-base/${id}`;

export function createProgress(cwd: string) {
  const git = async (...args: string[]): Promise<string> => {
    const { stdout } = await exec("git", args, { cwd });
    return stdout.trim();
  };

  const resolve = async (ref: string): Promise<string | null> => {
    try {
      return await git("rev-parse", "--verify", ref);
    } catch {
      return null;
    }
  };

  const phaseDone = async (
    phase: Phase,
    id: string,
    tip: string,
    baseTip: string | null,
  ): Promise<boolean> => {
    const [markedTip, markedBase] = await Promise.all([
      resolve(refName(phase, id, "tip")),
      resolve(refName(phase, id, "base")),
    ]);

    return markedTip === tip && markedBase === baseTip;
  };

  const markPhase = async (
    phase: Phase,
    id: string,
    tip: string,
    baseTip: string | null,
  ): Promise<void> => {
    await git("update-ref", refName(phase, id, "tip"), tip);
    if (baseTip) {
      await git("update-ref", refName(phase, id, "base"), baseTip);
    } else {
      await git("update-ref", "-d", refName(phase, id, "base")).catch(() => {});
    }
  };

  return { phaseDone, markPhase };
}

const SANDCASTLE_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

export const { phaseDone, markPhase } = createProgress(dirname(SANDCASTLE_DIR));
