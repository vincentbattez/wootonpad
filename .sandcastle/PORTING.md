# Porting sandcastle to another project

This setup assumes a **Node project**: `.sandcastle/Dockerfile` is Node-based and
`sandbox.installCommand` defaults to `npm install`. Another toolchain needs its
own Dockerfile and install command — config alone won't cover it.

## Steps

1. **Copy `.sandcastle/`** into the target repo. Drop `logs/`, `worktrees/` and
   `.env` — they are gitignored and machine-local anyway.

2. **Edit `.sandcastle/config.json`.** Every field has a default (see the schema
   in `lib/config.mts`); only declare what differs.

   | Field | What it is |
   |---|---|
   | `linear.project` | Linear project name, or `null` to select on label alone |
   | `linear.label` | Label marking an issue as agent-workable |
   | `linear.reviewState` | State applied once the PR is open |
   | `git.remote` / `git.baseBranch` | Where to push, and the PR target |
   | `git.branchPrefix` | Prefix for per-issue branches; must stay deterministic |
   | `git.repo` | `owner/name`. Derived from the remote when `null` — **pin it in a fork**, or `gh` will target the upstream |
   | `agent.model` / `retryRounds` / `implementIterations` | Agent budget |
   | `agent.quotaFastFailMs` | An implementer exhausted faster than this with no commit means the quota closed, not that the task was hard |
   | `schedule.leafTimeoutMinutes` / `runTimeoutMinutes` | Wall-clock budgets: per leaf (retried next round) and per run (an interruption, under the cron period) |
   | `schedule.pauseMinutes` | How long to stay away after an interruption that did not say when the window reopens |
   | `sandbox.installCommand` / `copyToWorktree` | Sandbox warm-up |
   | `sandbox.ignoreChurn` | Files the sandbox rewrites on its own (the lockfile); a worktree changed only there is clean |
   | `project.verifyCommands` | What agents run before committing. **Only list commands that exist** — a missing script wastes iterations |
   | `project.commitPrefix` | Prefix on every agent commit |
   | `project.codingStandardsFile` | What the reviewer applies |

3. **Create `.linear.toml`** at the repo root — it lives outside `.sandcastle/`
   and the `linear` CLI is useless without it:

   ```toml
   workspace = "your-workspace"
   team_id = "ABC"
   ```

4. **Create `.sandcastle/.env`** from `.env.example`: `CLAUDE_CODE_OAUTH_TOKEN`
   (or `ANTHROPIC_API_KEY`), `LINEAR_API_KEY`, and `LINEAR_TEAM_ID` matching the
   `team_id` above.

5. **Write `.sandcastle/CODING_STANDARDS.md`** for the project, or point
   `project.codingStandardsFile` at an existing document.

6. **Add to `package.json`:**

   ```json
   "scripts": {
     "sandcastle": "tsx .sandcastle/main.mts",
     "sandcastle:build-image": "sandcastle docker build-image"
   }
   ```

   Dev dependencies: `@ai-hero/sandcastle`, `tsx`, `zod`.

   Leave `--image-name` off — sandcastle derives `sandcastle:<repo-dir>` on both
   the build and the run side, so they agree by construction.

7. **Build the image:** `npm run sandcastle:build-image`.

8. **Check the host tooling:** `gh auth status` and `linear issue list` must both
   work — push and PR creation happen on the host, not in the sandbox.

9. **Declare dependencies in the tracker.** Waves are cut from `blocks`
   relations between an issue's leaves; a root with none declared costs one
   planner agent run, which writes what it inferred back as relations.

## Smoke test

Run it against a root issue whose sub-issues are all closed. It should report
`0 eligible` and exit without creating a branch, a PR, or a container:

```
npm run sandcastle ABC-1
```

## Running unattended

The orchestrator is built to run from a cron with nobody watching:

- **Lock** — `.sandcastle/lock` holds the PID; a second run exits at once.
- **Interruption** — when the Claude window closes or the run budget is spent,
  the run stops, leaves every issue where it was (`In Progress` stays
  `In Progress`), and writes `.sandcastle/state/paused.json` with when to come
  back. The next tick exits until then.
- **Journal** — `.sandcastle/state/` holds outcomes, durations, token usage and
  the session an interrupted agent can resume. Derived: delete it freely.
- **Incidents** — `.sandcastle/incidents.jsonl` lists every time an agent had to
  step in for the script. Read it to find what to make deterministic next.
- **Worktrees** — swept at startup once a week old; `npm run sandcastle clean`
  sweeps them all. One with uncommitted changes is kept and filed as an incident.

`.sandcastle/cron/` holds the launchd job for this machine. `cron/install.sh`
copies the script to `~/.local/bin`, the plist to `~/Library/LaunchAgents`, and
loads it: hourly, discovering every eligible root. Logs land in
`~/Library/Logs/sandcastle/`.
