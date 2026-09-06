# TASK

Deliver {{TASK_ID}} — {{ISSUE_TITLE}} — on branch `{{BRANCH}}` (checked out). It is a child of {{ROOT_ID}} and will be merged into `{{INTEGRATION_BRANCH}}`.

Only this issue. Siblings and the parent are context, not scope.

# CONTEXT

## Issue

!`linear issue view {{TASK_ID}} --json --no-pager`

## Comments (earlier runs report here)

!`linear issue comment list {{TASK_ID}} --json 2>/dev/null || true`

## Parent

!`linear issue view {{ROOT_ID}} --json --no-pager | jq '{identifier,title,description}'`

## Branch state

Commits here, not yet in `{{INTEGRATION_BRANCH}}`:

!`git log --oneline {{INTEGRATION_BRANCH}}..HEAD`

Commits in `{{INTEGRATION_BRANCH}}` missing here: !`git rev-list --count HEAD..{{INTEGRATION_BRANCH}}`

Working tree:

!`git status --short`

# RESUME

The branch may carry work from an earlier run. Before writing code:

1. Read the commits and comments above against the acceptance criteria. Keep what holds and continue from there.
2. If `{{INTEGRATION_BRANCH}}` has commits missing here: `git merge {{INTEGRATION_BRANCH}} --no-edit`, resolve conflicts, `npm test`.
3. Uncommitted changes are a crashed run: review them, then commit or discard.

# EXECUTION

Explore first: read the modules and tests the issue touches until you can name every file you will change. Read `CONTEXT.md` so names and interface vocabulary match the project's domain language, and respect the ADRs in `docs/adr/` for the area you touch.

## Seams

A **seam** is the public boundary you test at: the interface where behavior is observed without reaching inside. Tests live at seams, never against internals.

No user is available to confirm seams here. So: before writing any test, list the seams under test in the run, derive them from the acceptance criteria, and report them in the completion comment. You can't test everything — the seams land on critical paths and complex logic, not every edge case.

## TDD loop

Use TDD wherever it applies, at those seams: RED (one failing test), GREEN (only enough code to pass it), repeat.

- **Red before green.** Failing test first. No speculative code for tests not yet written.
- **One vertical slice at a time.** One seam, one test, one minimal implementation per cycle — each test a tracer bullet that responds to what the last cycle taught you.
- **No refactor inside the loop.** Refactoring belongs to the review stage that runs after this one.

Avoid: **implementation-coupled** tests (mocking internal collaborators, asserting through a side channel — the tell is a test that breaks on a refactor with unchanged behavior); **tautological** tests (expected value recomputed the way the code does it — it must come from an independent source: a known-good literal, a worked example, the spec); **horizontal slicing** (all tests first, then all implementation).

## Rhythm

Run the single test files you're touching often (`node --test <file>`). Run the full suite (`npm test`) before every commit and once at the end — it must be green.

Commit small and often, conventional format with the issue id: `type(scope): subject ({{TASK_ID}})`.

A user-facing feature also updates the `## What this fork adds` section of `README.md`, in the same run — only that section.

# COMPLETION

Complete when every acceptance criterion holds, `npm test` is green and the tree is clean. Then `linear issue comment add {{TASK_ID}} --body "<what landed, the seams tested, key decisions, what the reviewer should look at>"` and output <promise>COMPLETE</promise>.

Blocked or out of budget: commit what holds, comment the remaining work and the blocker, and output <promise>COMPLETE</promise> as well. The issue state is set by the merger, never here.
