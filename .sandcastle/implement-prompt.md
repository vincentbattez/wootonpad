# Context

You are working on a single Linear issue, **VIN-75 — Group projects into Areas in the sidebar**.

The spec is the source of truth and lives in the repo: `docs/specs/areas-spec.md`.
Supporting design records: `docs/areas-design.md`, `docs/adr/0001-areas-explicit-membership.md`,
`docs/adr/0002-areas-in-dedicated-tables.md`, vocabulary in `CONTEXT.md`, repo conventions in `CLAUDE.md`.

## Work plan and state

!`cat .sandcastle/PROGRESS.md`

## Commits already on this branch

!`git log --oneline -15`

## Sandbox constraints

!`echo "node $(node -v) | node_modules present: $([ -d node_modules ] && echo yes || echo no)"`

- `node_modules` is **not** installed and there is no install step. Do **not** run
  `npm install`, `npm start`, `npm run dev`, `vite build`, `esbuild`, or anything needing Electron.
- `npm test` (`node --test`) runs with zero dependencies — it is your only verification loop, and it must stay green.
- You cannot see the app running. Anything you cannot verify with `npm test` must be written
  conservatively, follow the patterns already in the file you are editing, and be flagged in
  `.sandcastle/PROGRESS.md` under "Notes for the next iteration".

# Task

Complete **exactly one** unchecked step of `.sandcastle/PROGRESS.md` — the first one, top to bottom.

## Workflow

1. **Explore** — read the relevant section of `docs/specs/areas-spec.md`, then read the source files
   and tests you are about to touch. Never write code before reading what surrounds it.
2. **Plan** — decide the smallest change that completes the step. Do not start the next step.
3. **Execute** — for anything landing in `src/vue/area-tree.mjs`, use RGR (Red → Green → Refactor):
   write the failing test in `test/area-tree.test.mjs` first, then the implementation.
   Tests are black-box: they call the exported functions and assert on the returned tree.
   No test may mount a component, touch SQLite, or start Electron.
4. **Verify** — run `npm test`. Every test must pass, including the pre-existing ones.
5. **Update the plan** — tick the step in `.sandcastle/PROGRESS.md` and append what the next
   iteration needs to know under "Notes for the next iteration". Keep it short.
6. **Commit** — a single commit, conventional-commit format as used in this repo
   (`feat(sidebar): ...`, `fix(sidebar): ...`, `refactor(sidebar): ...`), ending with a
   `Refs: VIN-75` line. Include `.sandcastle/PROGRESS.md` in the commit.

## Rules

- One step per iteration. Do not batch steps.
- Never commit with a failing `npm test`.
- Comments only where the intent is non-obvious, one line, per `CLAUDE.md`.
- No commented-out code, no `TODO` markers in committed code — blockers go in `PROGRESS.md`.
- Respect the spec's "Out of Scope" section. In particular: the card view stays untouched, and
  Project collapse is not persisted.
- If a step is genuinely blocked, do not fake it: write the blocker into `PROGRESS.md`, commit that
  note alone, and stop the iteration.

# Done

When every box in `.sandcastle/PROGRESS.md` is ticked and `npm test` is green, output the completion signal:

<promise>COMPLETE</promise>
