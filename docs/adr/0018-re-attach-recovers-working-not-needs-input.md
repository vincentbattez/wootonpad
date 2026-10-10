# Re-attach recovers `working`, not `needs input`

Picking a remote Session back up (VIN-160, ADR 0016) re-attaches a headless ssh PTY in the
background so a Session's State Dot is truthful before anyone clicks the row. "Truthful" has a
seam: on re-attach we seed the Dot from the one piece of State that outlives the dropped client —
the `tmux` pane title, the CLI's last OSC 0. That title is busy-or-idle only (`cli-activity.js`:
a spinner glyph means `working`, `✳` means resting). So a re-attach recovers `working`
immediately and nothing else; an idle Session keeps whatever State the mirror last carried.

`needs input` cannot be recovered this way. It is the OSC 9 notification Claude emits at the
instant it wants attention (a permission prompt, plan mode, an off-focus turn end) — emitted live
into the stream, never written to any `tmux`-held State. A Session paused at a prompt and a
Session that merely finished a turn present the *same* idle title (`✳` — "resting, waiting on the
human", indistinguishable). There is no busy/idle signal that separates them.

**This leaves one honestly-wrong case.** A Session sitting at a prompt when the link dropped wakes
showing its last mirrored Dot (`done` or `sleeping`), not `needs input`, until the CLI's next live
OSC 9 repaint flips it. For the prompt case that stale Dot is wrong, not merely lagging. It
touches AC #2 ("wake → re-attached automatically, State refreshed"): `working` is refreshed on
wake; `needs input` is refreshed only once the live stream resumes.

## Considered options

**Re-derive `needs input` from `tmux` state on re-attach.** There is no state to read. The pane
title is the only durable signal and it is busy/idle only; OSC 9 is ephemeral. This is not a gap in
our wiring — the signal is genuinely gone once the client that received it is gone.

**Scrape `tmux capture-pane` content and detect the prompt UI.** The prompt box is visible in the
pane, so in principle its presence could be matched. Rejected: it is fragile UI-scraping against a
TUI whose layout and glyphs change between CLI releases and across locales, exactly the kind of
inferred signal the State model refuses elsewhere (ADR 0015, "`done` is declared, never inferred").
A heuristic that is wrong in a new way is worse than a stale Dot that is wrong in a known,
documented way, and it still could not reliably separate a permission prompt from a plain finished
turn.

**Persist `needs input` into the mirror so it survives a restart.** The mirror is an `rsync` of the
Host's JSONL (ADR 0016, remote-project-key-scheme); it carries the transcript, not the live Dot.
`needs input` is a renderer-side runtime signal with no on-disk home, and inventing one would mean
writing app state onto the user's Host — the same line ADR 0015 declined to cross for a `Stop`
hook.

## Consequences

Re-attach seeds `working` and leaves every other State to the live stream, which resumes within one
re-attach. The window of the wrong Dot is bounded by how long until the CLI next repaints — short
in practice, because an attached CLI at a prompt repaints on the next notification or keypress —
and the behaviour is documented to users in the README ("Pick remote Sessions back up") rather than
hidden.

**Sign-off.** The README note is documentation, not acceptance. Treating the stale prompt-case Dot
as satisfying AC #2 is a product call, not an engineering one; this ADR records the constraint and
the trade-off so that decision can be made and tracked explicitly. Until a product owner signs off
on the shortfall, AC #2 is met for `working` and open for the `needs input` prompt case.
