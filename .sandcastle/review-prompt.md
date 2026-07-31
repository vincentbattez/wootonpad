# Task

Review the work just committed for **VIN-75 — Group projects into Areas in the sidebar** and fix what is wrong,
directly on this branch. The spec is `docs/specs/areas-spec.md`.

# Context

## Diff under review

!`git diff {{DIFF_RANGE}}`

## Commits under review

!`git log {{DIFF_RANGE}} --oneline`

## Remaining plan

!`cat .sandcastle/PROGRESS.md`

# Review process

1. **Spec conformance** — does the change do what `docs/specs/areas-spec.md` asks for that step?
   Check it against the numbered user stories and the "Implementation Decisions" section.
   Flag anything that quietly landed from the "Out of Scope" list.
2. **Correctness** — edge cases from the spec's testing section: orphan assignments, empty Areas,
   cycles, self-drops, unfiled Projects, deletion promoting children one level.
   Are the new behaviours actually covered by tests in `test/area-tree.test.mjs`?
   A test asserting on internals rather than the returned tree is a defect.
3. **Clarity** — reduce nesting and redundant abstraction, prefer explicit code over clever code,
   no nested ternaries, names that say what the value is. Remove comments that restate the code.
4. **Project standards** — @.sandcastle/CODING_STANDARDS.md
5. **Balance** — do not over-simplify: keep helpful abstractions, do not merge unrelated concerns,
   never change what the code does, only how it does it.

# Execution

- Run `npm test` first. If it is red, fixing it is the whole job.
- `node_modules` is not installed. Only `npm test` is available — do not run `npm install` or any build.
- Make corrections directly on this branch and commit them separately
  (`refactor(sidebar): ...` or `fix(sidebar): ...`, ending with `Refs: VIN-75`).
- If the code is already correct and clean, change nothing and commit nothing.
- If you find a spec violation you cannot fix within this step, write it into
  `.sandcastle/PROGRESS.md` under "Notes for the next iteration" and commit that note.

Once done, output <promise>COMPLETE</promise>.
