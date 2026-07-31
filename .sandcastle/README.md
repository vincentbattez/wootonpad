# Sandcastle — VIN-75

Autonomous implementation of `docs/specs/areas-spec.md` (Linear VIN-75) inside a Docker sandbox.

## One-time setup

```bash
claude setup-token                    # then paste the token into .sandcastle/.env
npm run sandcastle:build-image        # builds the image `sandcastle-wootonpad`
```

`.sandcastle/.env` is gitignored. It needs `CLAUDE_CODE_OAUTH_TOKEN` (or `ANTHROPIC_API_KEY`).

**`.sandcastle/` and `docs/specs/areas-spec.md` must be committed on `main`** (or on whatever
`BASE_BRANCH` points to in `main.mts`) before the first run. The sandbox is a git worktree forked
from that branch, so it only sees committed files — `copyToWorktree` cannot fill the gap, it runs
before every hook and does not create missing parent directories.

## Run

```bash
npm run sandcastle
```

Each cycle: an implementer completes the first unchecked step of `PROGRESS.md`, runs `npm test` and
commits; a reviewer then checks that cycle's commits against the spec and fixes what it finds.
The loop stops when every box in `PROGRESS.md` is ticked, or when a cycle produces no commit.

Work lands on the branch `feature/vin-75`, forked from `main`. Nothing is pushed.
Budget: up to 16 cycles × 2 Opus agents. Ctrl-C stops it; the branch keeps what already landed.

```bash
git log main..feature/vin-75 --oneline
git diff main..feature/vin-75
```

## What the sandbox can and cannot verify

`node_modules` is deliberately not installed: the host binaries (`better-sqlite3`, `node-pty`) are
darwin-arm64 and would be broken under Linux. `npm test` is `node --test` over pure modules and
needs zero dependencies — verified green in the image.

So the agent self-verifies `src/vue/area-tree.mjs` and its tests. It cannot run Electron, build the
Vue bundle, or exercise the sidebar and the drag-and-drop handlers — steps 6 to 12 of `PROGRESS.md`
land unverified by construction and need a human pass.

## Tuning

- Plan and inter-iteration memory: `PROGRESS.md` (the agent ticks boxes and appends notes)
- Prompts: `implement-prompt.md`, `review-prompt.md`
- Review standards: `CODING_STANDARDS.md`
- Model, branch, cycle count: constants at the top of `main.mts`

To restart from scratch: reset `PROGRESS.md`, delete the branch and `.sandcastle/worktrees/`.
