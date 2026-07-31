// VIN-75 — Areas in the sidebar, implemented autonomously.
//
// One long-lived sandbox on the branch `feature/vin-75`. Each cycle:
//   Phase 1 (implement) — the agent completes the first unchecked step of
//                         .sandcastle/PROGRESS.md, runs `npm test`, commits.
//   Phase 2 (review)    — a second agent reviews only that cycle's commits
//                         against docs/specs/areas-spec.md and fixes what it finds.
//
// The loop stops when the implementer emits <promise>COMPLETE</promise>
// (every box in PROGRESS.md ticked) or when a cycle produces no commits.
//
// Usage: npm run sandcastle
//
// The sandbox is a git worktree forked from BASE_BRANCH, so it only sees committed
// files. `.sandcastle/` and `docs/specs/areas-spec.md` must be committed on
// BASE_BRANCH before the first run (copyToWorktree cannot help: it runs before any
// hook and does not create missing parent directories).

import * as sandcastle from "@ai-hero/sandcastle";
import { docker } from "@ai-hero/sandcastle/sandboxes/docker";

const IMAGE_NAME = "sandcastle-wootonpad";
const BRANCH = "feature/vin-75";
const BASE_BRANCH = "main";
const MODEL = "claude-opus-4-8";

// One cycle per PROGRESS.md step, plus a margin for retries and the final pass.
const MAX_CYCLES = 16;

// No install hook and no node_modules copy on purpose: the host binaries are
// darwin-arm64 (better-sqlite3, node-pty) and would be broken inside Linux.
// `npm test` is `node --test` on pure modules — it needs zero dependencies.
const sandbox = await sandcastle.createSandbox({
  branch: BRANCH,
  baseBranch: BASE_BRANCH,
  sandbox: docker({ imageName: IMAGE_NAME }),
});

console.log(`Worktree: ${sandbox.worktreePath}`);

try {
  for (let cycle = 1; cycle <= MAX_CYCLES; cycle++) {
    console.log(`\n=== Cycle ${cycle}/${MAX_CYCLES} ===\n`);

    const implement = await sandbox.run({
      name: `implement-${cycle}`,
      maxIterations: 1,
      agent: sandcastle.claudeCode(MODEL),
      promptFile: "./.sandcastle/implement-prompt.md",
    });

    if (!implement.commits.length) {
      console.log("No commits this cycle — stopping.");
      break;
    }

    // Review only what this cycle produced, by count: `main` may not exist
    // as a ref inside the sandbox, so no merge-base is available.
    await sandbox.run({
      name: `review-${cycle}`,
      maxIterations: 1,
      agent: sandcastle.claudeCode(MODEL),
      promptFile: "./.sandcastle/review-prompt.md",
      promptArgs: { DIFF_RANGE: `HEAD~${implement.commits.length}..HEAD` },
    });

    if (implement.completionSignal) {
      console.log("\nImplementer signalled COMPLETE — plan exhausted.");
      break;
    }
  }
} finally {
  const { preservedWorktreePath } = await sandbox.close();
  if (preservedWorktreePath) {
    console.log(`Uncommitted changes preserved in ${preservedWorktreePath}`);
  }
}

console.log(`\nDone. Review the work with: git log main..${BRANCH} --oneline`);
