// The project's git plumbing — `git-core.mts` bound to `.sandcastle/config.json`.

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.mts";
import { createGit } from "./git-core.mts";

const SANDCASTLE_DIR = dirname(dirname(fileURLToPath(import.meta.url)));

export const {
  git,
  listRefs,
  fetchRemote,
  tipOf,
  isAncestor,
  branchHasCommits,
  buildWaveBase,
  rebaseLeafOnto,
  resetBranchTo,
} = createGit({
  cwd: dirname(SANDCASTLE_DIR),
  baseBranch: config.git.baseBranch,
  worktreeRoot: join(SANDCASTLE_DIR, "worktrees"),
});
