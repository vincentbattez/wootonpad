# `done` is declared, never inferred

The dot to the left of a Session row exists to answer one question: **does this row still want
something from me?** For that it renders the **Session State** — one value of four, one at a
time: `sleeping`, `needsInput`, `working`, `done`.

Three of the four fall out of signals the app already reads. `working` is the busy signal (the
OSC 0 / OSC 9;4 spinner). `needsInput` is the union of an OSC 9 attention/approval/permission/
plan-mode notification and a turn that just ended on an unfocused Session. `sleeping` is the
absence of all of them. The fourth, `done`, is different in kind: **no machine can observe it.**
A CLI that has finished the job and a CLI that is waiting for the next instruction are
indistinguishable from the outside — same idle prompt, same quiet PTY. So `done` is **declared,
never inferred.**

## Two writers, and only two

1. **The human**, from the Session row — a gesture at the same level as Pin and Archive. The
   human is the only one who reliably knows a subject is closed, so this is the **main path**.
2. **The agent**, through a `markSessionDone` MCP tool on the per-Session bridge
   (`mcp-bridge.js`), beside `openDiff` / `openFile` / `getDiagnostics`. No parameter, one line
   of description, ~30 tokens in the system prompt. A bonus, not the main path: agents will call
   it irregularly, and that is fine.

`markSessionDone` is **not** `stop`. The Stop button kills the PTY; this closes the subject.
The two words must not drift into one another, in the code or the UI.

## Automatic lift

`done` is sticky, but lifted automatically by **the busy signal alone** — the CLI actually
resuming work. Terminal noise does not lift it, a TUI repaint does not, opening the Session does
not. The lift is a **persisted write** (the flag goes to 0), not a display trick: a green dot on
a Session that has resumed is the one lie the State Dot must never tell.

## Alternatives rejected

Every automatic *derivation* of `done` was considered and rejected:

- **A `.jsonl` heuristic** ("last entry is an assistant turn with no pending tool call") — guesses
  at closure from shape, and a Session waiting for the next instruction looks identical.
- **An LLM reading the transcript** — spends tokens and latency to guess at something the human
  knows for free, and still guesses.
- **A `Stop` hook** — fires at the end of *every* turn, so it marks "waiting" as "finished"; and
  it requires writing into the user's `~/.claude/settings.json`, which the feature must never do.

All three infer. Inference here is a downgrade over a one-gesture declaration, and it buys a
false green — the single worst failure this dot can have.

## Consequences

`done` is user data, persisted in `session_meta` beside `starred` and `archived` — it survives a
restart and is never purged by a cache migration. It is orthogonal to `archived`: marking done
files nothing away, archiving declares nothing finished. Reading a `done` Session does not
un-green it — reading is not working. The Session State is computed by a pure module in the
renderer (`session-state.mjs`), not arbitrated in a stylesheet, because only the renderer knows
which Session is focused, and that already conditions the unread signal.
