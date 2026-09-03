# Git is the source of truth for resumption; the journal is derived

The orchestrator is interrupted as a matter of routine — the 5-hour Claude window closes
mid-run, and the cron restarts it hours later. Resuming correctly is not an edge case, it is
the normal path. The reflex for that is a state store: a database, or a run file recording
what happened so the next run can pick it up.

We do the opposite. Everything a resume needs is **already in git** and is read from there.
Which branch carries a leaf's work, whether it has commits of its own, whether it is contained
in the base, which integration branch a previous attempt assembled — all of it is a git query.
Phase completion lives in refs under `refs/sandcastle/`, outside `refs/heads` and `refs/tags`,
so it never shows up in `git branch` and is never pushed. Each marker is a *pair* of refs, the
branch tip and the base tip it was reached against, because the same branch reviewed on top of
`main` has not been reviewed on top of `main + wave 1`.

The journal in `.sandcastle/state/` records what happened — outcomes, durations, token usage,
session file paths, waves as planned. It exists for observability, for the cron report, and as
a cache. It is **derived**. Deleting the whole directory degrades what we can see about a run
and must never change what the next run does.

The invariant this buys: git and the tracker cannot disagree with a third store, because there
is no third store. A local state file is the one artefact guaranteed to be absent when it
matters — a fresh clone, another machine, a disk cleared to make room for the 13 GB of
worktrees. Anything the orchestrator would refuse to redo on the basis of a file it cannot
find is work it would silently skip.

This is also why the AI planner's inferred dependencies are written back to the **tracker**
rather than cached in the journal. A dependency between two tickets is domain information, and
resumption reading it from a local file would put resumption back on the journal.

## Consequences

Session resumption is the one place this bites. `sessionFilePath` points at a JSONL on the
host, outside git, and it is the only handle on an interrupted agent's reasoning. It is stored
in the journal — so it is, correctly, an optimisation: when the file is there the agent resumes
its train of thought, and when it is gone the implementer falls back to a cold re-prompt with
its diff. The fallback is not a degraded mode to be fixed later; it is what keeps this decision
true.

Anything an agent produces that is not committed is invisible to a resume. That makes "commit
often" a correctness requirement rather than hygiene, and it is why a timeout must let the
running leaf commit before it dies, and why a worktree with uncommitted changes is never
deleted silently.

Some state is genuinely not git-shaped and lives outside anyway: the PID lock, and the
incident log at `~/.config/orchestrator/incidents.jsonl`. Neither is read to decide what work
to redo, which is the line that matters.
