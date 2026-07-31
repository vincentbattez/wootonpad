# Issue tracker: Linear

Issues and PRDs for this repo live in Linear, accessed through the `linear` MCP server
(plugin `linear`, tools prefixed `mcp__plugin_linear_linear__`). Never use `gh issue` for
this repo — GitHub Issues are not the tracker here.

- **Workspace**: `vincentbattez`
- **Team**: `Vincentbattez` (key `VIN`) — the only team in the workspace
- **Project**: `Wooton` — https://linear.app/vincentbattez/project/wooton-97fd20818c8d

## Setup

The `linear` plugin must be installed and authenticated (`/plugin`, then `/mcp`). Load its
tools with ToolSearch before use. If they are unavailable, stop and tell the user rather than
falling back to another tracker.

## Conventions

- **Create an issue**: `save_issue` with `team: "Vincentbattez"` and `project: "Wooton"`.
  Title concise; body structured as Context / Objective / Acceptance criteria / Additional
  information.
- **Read an issue**: `get_issue`, plus `list_comments` — read both before acting on it.
- **List issues**: `list_issues` filtered by `project: "Wooton"`, plus label and state.
- **Comment**: `save_comment` on the issue rather than editing the description.
- **Labels**: `save_issue` with the `labels` array; see `docs/agents/triage-labels.md`.
- **Close**: `save_issue` with `state: "Done"` (or `Canceled`) plus an explanatory comment.
- Reference issues by their Linear identifier (e.g. `VIN-42`), never by a bare `#number`.

## Mirror new work to Things 3

New work created in Linear for this repo is also mirrored as a task in the user's Things 3
to-do list, using the `things3` skill (`things` CLI). Do it in the same run, right after
`save_issue` succeeds.

The point is that nothing gets forgotten: everything the user has to do surfaces in Things 3.
Only the parent surfaces there — never the details.

**Mirror the root of a work item, never its children.** A feature broken into 10
implementation tickets stays a single Things task, the one named after the feature.

- A spec, feature, or parent issue is published (`/to-spec`) → create the task.
- A standalone issue with no parent — feature, bug, chore, whatever it is → create the task.
- Children — `/to-tickets` slices, sub-issues, any ticket under a spec → create nothing. The
  parent already has its task.

Fields:

- **Project**: `👨‍💻 Wooton` (area `Dev`) — pass the emoji, it is part of the title.
- **Title**: the feature in French, short and direct (~35 characters) with the ticket ID. The Things title column is narrow
- **Notes**: `VIN-XX — <one-line French summary>` on the first line, the Linear spec URL on the second.
- **Tags**: none by default — the user applies effort/priority tags themselves.

```bash
things add "[VIN-60] Thème clair / sombre" --list "👨‍💻 Wooton" \
  --notes "VIN-60 — Thème clair/sombre/système normalisé sur Radix Colors
https://linear.app/vincentbattez/issue/VIN-60/theme-clair-sombre-systeme-normalise-sur-radix-colors"
```

Check for an existing task first to avoid duplicates. `--project` requires a `--query`; `title:/./` is the catch-all:

```bash
things search --query=title:/./ --project="👨‍💻 Wooton" --select="uuid,title,notes" --json
```

The first result is the project row itself (title `👨‍💻 Wooton`, empty notes), not a duplicate.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(Set to `yes` if this repo treats external PRs as feature
requests; `/triage` reads this flag. GitHub PRs would then be read with `gh pr view` /
`gh pr diff`, while the tickets themselves stay in Linear.)_

## When a skill says "publish to the issue tracker"

Create a Linear issue in the `Wooton` project.

## When a skill says "fetch the relevant ticket"

`get_issue` on the Linear identifier, plus `list_comments`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a parent issue; **tickets** are its sub-issues.

- **Map**: an issue labelled `wayfinder:map` holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: a Linear sub-issue of the map (`save_issue` with `parentId`), labelled
  `wayfinder:<type>` (`research` / `prototype` / `grilling` / `task`). Assigned to the driving
  dev once claimed. Create these labels on first use — they don't exist yet.
- **Blocking**: Linear's native "blocked by" issue relations. A ticket is unblocked when
  every blocker is closed.
- **Frontier query**: the map's open sub-issues, minus any with an open blocker or an
  assignee; first in map order wins.
- **Claim**: assign the issue to the current user — the session's first write.
- **Resolve**: comment the answer, close the issue, then append a context pointer to the
  map's Decisions-so-far.
