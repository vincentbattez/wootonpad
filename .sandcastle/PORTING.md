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
   | `sandbox.installCommand` / `copyToWorktree` | Sandbox warm-up |
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

## Smoke test

Run it against a root issue whose sub-issues are all closed. It should report
`0 eligible` and exit without creating a branch, a PR, or a container:

```
npm run sandcastle ABC-1
```
