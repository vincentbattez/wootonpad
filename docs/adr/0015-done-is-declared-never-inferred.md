# `done` is declared, never inferred

Three of the four Session States fall out of signals the app already reads: a live spinner means
`working`, a permission prompt or a finished turn means `needsInput`, the absence of both means
`sleeping`. `done` has no such signal. A CLI that has finished the job and a CLI waiting for the
next instruction look identical from the outside — the difference is whether the *subject* is
closed, which lives in someone's head, not in the terminal.

So `done` is set explicitly, from two places and no others: **the human, from the row**, and
**the agent, through a `markSessionDone` tool on the per-Session MCP bridge** that is already
attached to every CLI. It is persisted beside `starred` and `archived`, and it is lifted
automatically the first time the Session goes busy again — a green line that quietly resumed
work would be the one lie the State Dot must never tell.

## Considered options

**A `Stop` hook.** The obvious answer, and wrong twice. It fires at the end of *every* turn, so
it marks `done` on every reply — it detects "the CLI stopped talking", which is precisely the
signal we already have and precisely not the one we need. And installing it means writing to the
user's `~/.claude/settings.json`, which this app has never done and should not start doing to
paint a dot.

**Reading the transcript with an LLM** to judge whether the work looks finished. A guess, priced
per Session, about something the agent could simply state.

**`done` = `archived`.** Conflates "the work is finished" with "put this away". Sessions get
archived because they were abandoned just as often as because they succeeded, and an archived
Session is hidden by design (ADR 0005) — exactly where a `done` marker is of no use to anyone.

## Consequences

The MCP tool ships as one line of description and no parameters, in the style of the five tools
already on the bridge. No instruction is injected into the CLI's prompt, no `CLAUDE.md` rule is
required of the user. The direct consequence is that **agents will call it irregularly**: the
manual path is the primary one and must stay a single click, with the tool as a bonus that
costs about thirty tokens a session.

`markSessionDone` is not `stop`. The row's existing Stop button kills the PTY; this closes the
subject. Two words that must not drift into each other.
