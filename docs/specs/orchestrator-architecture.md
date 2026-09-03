# Make the orchestrator survive its own interruption, and stop paying an agent to be deterministic

Scope: `.sandcastle/` in this repo. Design settled in a grilling session, 2026-09-02.

## Vocabulary

Two things share the name "sandcastle" and must not be confused.

- **The runner** — `@ai-hero/sandcastle`, an upstream dependency. Docker sandboxes, git
  worktrees, the agent iteration loop, completion signals, session capture. We consume it.
- **The orchestrator** — `.sandcastle/main.mts` and `.sandcastle/lib/`, ~1600 lines written
  here. Tracker tree in, pull request out. This document is about the orchestrator.

Its own terms, which the rest of this document uses precisely:

- **Root** — a tracker issue given to the orchestrator as a unit of work. One root, one PR.
- **Leaf** — a childless descendant of a root. Leaves are the work items; intermediate nodes
  are specs, not tasks. A childless root is its own leaf.
- **Wave** — a set of leaves with no dependency between them, so they run concurrently. Wave
  N is cut from the base branch plus everything waves 1..N-1 landed.
- **Integration branch** — the per-root branch a run assembles and pushes. Named `VIN-107`,
  `VIN-107-2`, … one per attempt.
- **Outcome** — what became of one leaf in one run. Drives retry and issue state.
- **Provider** — the seam behind a tracker (Linear, GitHub Issues, Jira, markdown) or a forge
  (GitHub, GitLab).

## Problem Statement

The orchestrator works — it has shipped VIN-92 and VIN-107. But it was built for supervised
runs, and the target is the opposite: a cron firing every 5 hours, on any project, against any
tracker and any git host, with nobody watching. Four things block that.

**It cannot tell a dead battery from a broken engine.** When the 5-hour Claude window closes,
the runner does not raise a rate-limit error — it exposes no such concept. The agent simply
stops emitting, `completionSignal` stays `undefined`, and `classifyOutcome` returns
`exhausted` — the exact same verdict as an agent that burned 100 iterations trying. The
orchestrator then does the worst possible thing: it re-plans and relaunches, burning the
remaining rounds against a wall, and drops every issue back to `Todo` as if the work had
failed. It had not. It had not started.

**It restarts work it already did.** Phase markers (`refs/sandcastle/implemented|reviewed/`)
are written *after* an agent returns. A process killed mid-run leaves no marker, so the next
run puts a fresh agent on a ticket that may be 80% committed — and pays full price for it.
Meanwhile the runner captures a resumable session JSONL at a *host* path that outlives the
sandbox, and nothing reads it.

**It pays Opus to do arithmetic.** Four agent calls per feature: planner, implementer,
reviewer, integrator. Two of them are deterministic problems wearing a trench coat. The
planner orders tickets that Linear can already order via `blocks` relations — a topological
sort, exact and free. The integrator merges N branches, which is `git merge` in a loop until
it isn't.

**It is welded to Linear and GitHub.** `main.mts` imports `lib/linear.mts` and
`lib/github.mts` directly. `PORTING.md` says, in as many words, to copy the folder into the
next repo — N divergent copies, by design.

Two smaller ones, found while measuring: `.sandcastle/worktrees/` holds **13 GB across 16
abandoned worktrees** (VIN-93 through VIN-119), never cleaned, each carrying a copy of
`node_modules`; and there is **no lock**, so a run overrunning 5 hours meets the next cron on
the same branches and refs.

## Principles

Three ideas govern every decision below. Each has an ADR.

1. **Git is the source of truth for resumption; the journal is derived.** Deleting
   `.sandcastle/state/` must degrade observability and never break a resume. See
   [ADR 0012](../adr/0012-git-is-the-resume-source-of-truth.md).
2. **Deterministic by default, AI on the exception path.** Scripted happy path; an agent is
   called only where the script fails, scoped to the failure. See
   [ADR 0013](../adr/0013-deterministic-by-default-ai-on-the-exception-path.md).
3. **Providers declare capabilities; the interface is not levelled down.** A markdown tracker
   must not cost Linear its relations. See
   [ADR 0014](../adr/0014-providers-declare-capabilities.md).

## Design

### Outcomes and issue state

`Outcome` gains **`interrupted`**: the platform stopped us, the work itself is unjudged. It is
not settled and not retryable *within this run* — it aborts the run. It travels two ways: as
a value, for the journal and the report; and as a dedicated exception that short-circuits to
the entry point, because every enclosing loop would otherwise keep going.

An interrupted leaf **stays `In Progress`** in the tracker. That is true — the work is real,
it is on a branch, it will resume. Dropping it to `Todo` in a `catch` destroys the only
visible trace that something is in flight.

The cost is orphan states: a `SIGKILL` leaves `In Progress` with nobody working. That is
reconciled **at startup**, where the answer is knowable: an `In Progress` issue with no live
lock is either resumed by this run or reset. Never decided mid-panic.

### Detecting the closed window

No pre-flight probe. Two sensors, both after the fact:

- **stdout parsing** for Claude Code's rate-limit wording — direct, and brittle the day
  Anthropic rewords it.
- **Duration heuristic** — the robust one. A leaf that exhausts 100 iterations takes tens of
  minutes; a leaf cut down by the quota returns in seconds. Several leaves ending `exhausted`,
  fast, with no commits, is not iteration exhaustion. It is the platform.

The duration sensor is why roots must run **sequentially** (below): concurrent failures on a
network blip are indistinguishable from a quota wall.

An `interrupted` outcome must **never** trigger the AI fallback of §Self-repair. A platform
outage is not a reasoning problem, and spending tokens on it spends tokens that no longer
exist.

### Resuming an implementer

Two mechanisms, tried in order:

1. **Session resume.** Persist `IterationResult.sessionFilePath` in the journal; relaunch the
   captured Claude session. The agent keeps its reasoning, not just its diff.
2. **Cold re-prompt.** A fresh session handed `git log`/`git diff` of its branch and told what
   it already did.

(2) is the floor, and it exists anyway — it is also the path used when a reviewer sends work
back. (1) is strictly better when it applies but cannot be relied on: the JSONL can be purged,
stale, or written by a model we no longer run.

Both improve when the implementer commits often, so the prompts say so. Uncommitted work is
work lost — `preservedWorktreePath` suggests some of the 13 GB above is exactly that.

### Deterministic planning

Waves come from a **topological sort of the tracker's `blocks` relations**. The AI planner
becomes the fallback for when no relations are declared.

When it runs, it **writes the relations it inferred back into the tracker**, bounded to
issues under the current root, logged in the journal and commented on the issue. That is what
makes the fix permanent: the next run is deterministic. A dependency between two tickets is
domain information — its home is the tracker, not a local cache. Storing it in the journal
would make resumption depend on the journal, violating principle 1.

The side effect is the real prize: dependencies become **declared by a human, before the run**,
instead of guessed by an agent during it.

### Deterministic integration

`git merge` in a loop. An agent is called only on a conflict or a red suite, and only for the
merge that failed. Its licence is narrow:

- conflicted files only, no other edit;
- no blanket `--ours`/`--theirs` — every hunk handled;
- `verifyCommands` must pass;
- 10 iterations, then the root fails and files an incident.

The failure mode being defended against is silent and expensive: an agent "resolving" a
conflict by deleting another leaf's work produces a green PR with a feature missing. And a
conflict unresolved after 10 iterations is almost always *semantic* — two leaves made
incompatible decisions, which is a design call, not something to settle unattended at 3am.

### Self-repair

When the deterministic path throws, the agent fallback does two things: **unblock now**, and
**capitalise** — file an incident so the case can become deterministic later.

Incidents are appended to `~/.config/orchestrator/incidents.jsonl`, not filed as tickets. An
unsupervised run that opens tickets can produce forty identical ones overnight. A local log is
free, dedupable, and shows the real distribution of exceptions before any of it is modelled.
Promotion to real tickets comes once the incident format has settled.

The orchestrator never patches itself mid-run. A tool that rewrites itself while running is
not reproducible and cannot be debugged.

### Scheduling, locks, timeouts

- **One project per cron tick.** Cross-project token arbitration is deliberately out of scope
  (the quota is per-account, not per-repo, so parallel projects starve each other). The
  registry supports several; the cron runs one. Revisit when a second project is real.
- **Roots run sequentially** within a project. Waves stay concurrent inside a root — that is
  where the dependency graph buys something. Root-level concurrency buys nothing against a
  shared quota, makes interruption more destructive, and blinds the duration sensor.
- **Lock per repo**, PID-based. A second run exits immediately.
- **Two timeouts**: per leaf (~45 min, catches the agent looping on an impossible ticket — the
  real token sink) and global (~4h against a 5h cron, configurable). Both `SIGTERM` cleanly,
  and the running leaf **commits what it has** first, because resumption reads the branch.

### Worktree lifecycle

Deleted as soon as a leaf settles with its work committed; age-based sweep (>7 days) at
startup as a net; `orchestrator clean` for the rest. One exception, non-negotiable: a worktree
holding **uncommitted changes is never deleted silently** — it is kept and reported as an
incident. Everything else is reconstructible from git and should go aggressively.

### Providers

Each provider declares what it supports — `canSetState`, `hasRelations`, `hasLabels` — and the
orchestrator degrades: no relations means the AI planner fallback, no states means no status
reporting. **The provider always yields a tree**; deriving one is its problem (GitHub Issues
from task lists, Jira from epics). The orchestrator only ever sees trees.

The markdown provider simulates states and relations in front-matter (`status:`,
`blocked-by:`) — which is how a human would want to read it anyway.

### Configuration

The orchestrator becomes a globally installed CLI taking a repo path. The target repo keeps
only what is its own: `config.json`, coding standards, `Dockerfile`, and any prompt it wants to
override. Default prompts ship with the CLI; a repo overrides one file at a time
(`.sandcastle/prompts/implement.md` wins if present) — roughly 90% of a prompt is generic and
10% is not, and a Rust project does not describe "verify your work" like a React one.

The cron reads `~/.config/orchestrator/projects.toml`: repo path, tracker, forge, priority.
A hand-edited file is the right interface below ~20 repos.

Note for the port: `RunOptions.cwd` supports an arbitrary host repo, but `promptFile` resolves
against `process.cwd()` regardless — pass absolute prompt paths.

## Plan

Ordering is deliberate: **make it good, then move it.** Extraction into a package is the
longest, most cross-cutting, riskiest task in the set; handing it to the orchestrator as its
first unsupervised job means testing it on its worst case. A deterministic, resume-aware
orchestrator still living in `.sandcastle/` is a far safer candidate — and by then the module
boundaries are already clean, so the move is mechanical. Extraction earns nothing until a
second project exists.

**Wave 1 — determinism and robustness**, in `.sandcastle/`.

The foundations go **by hand**, marked `ready-for-human`: the `Outcome` type, quota detection,
the lock. We do not hand an agent the mechanism that catches it when it falls — if it breaks
quota detection during a quota-truncated run, both failures land at once and the diagnosis is
miserable.

The rest is delegated to the orchestrator, `ready-for-agent`: deterministic planner,
scripted integrator, worktree lifecycle, journal and report, provider interface, and a
markdown provider.

Wave 1 includes the provider **interface** *and* a second implementation. An abstraction with
one implementer is Linear's shape wearing generic names, and it breaks on contact with the
first real second provider. Markdown is cheap and proves the capability contract.

**Wave 2 — extraction** into a CLI + package, by hand. Jira and GitLab wait for a project that
needs them.

## Verification

The existing discipline holds and is the reason `pipeline.mts` and `resume.mts` are testable
at all: decision logic stays pure with I/O injected, and lives in
`test/sandcastle-*.test.mjs` under `node --test`. On top of it:

- **Provider contract tests** — one suite replayed against every provider. This is the
  executable definition of "being a provider", and it is worth more than the TypeScript
  interface.
- **An end-to-end test on a throwaway repo with a stubbed agent.** Resumption is the point of
  this whole document and is currently the least verifiable part of it, because triggering it
  for real means waiting to be cut off by a quota. A stubbed agent makes interruption
  reproducible on demand.
