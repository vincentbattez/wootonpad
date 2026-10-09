# VIN-151 — Spike runbook: SSH + tmux + Claude on a Remote Host

Status: **prepared, not yet run against the real Remote Host.**

This spike verifies by hand, on `ssh mac-mini`, the assumptions ADR 0016 rests on, before any
remote PTY code is written. It is pure verification: no app code. Each acceptance criterion is
tied below to an exact command, a raw-capture file, and the marker that proves it. Observation
and verdict slots are left blank on purpose — they are filled from what the capture actually
shows, never from expectation.

Run the harness **on the MacBook** (the Local Host), the machine that actually reaches the Mini:

```sh
./scripts/vin-151-verify.sh all        # or: osc9 | path | detach | scrollback
```

The launch shape under test lives in one place — `tmux_launch()` in `scripts/vin-151-verify.sh`
— so a reviewer can check it against ADR 0016 without reading the whole script:

```
ssh -tt -o BatchMode=yes mac-mini -- $SHELL -lc '
  tmux -L wootonpad new-session -A -s wp-<id> <cmd>
    \; set -g prefix None
    \; set -g status off
    \; set -g allow-passthrough on
    \; set -g set-titles on'
```

---

## Blocker found before running (record this regardless)

**ADR 0016 and the CONTEXT.md "Hosts" section are not on `feature/vin-150`.** They live only on
branch `docs/vin-150-remote-hosts` (commit `643638c`). This spike branch (`sandcastle/issue-VIN-151`,
cut from `feature/vin-150`) therefore has no `docs/adr/0016-*.md` to amend. Before the findings
below can "amend ADR 0016 wherever it turns out wrong", that doc commit must be merged into
`feature/vin-150`. Flagged for the VIN-150 integrator.

The agent sandbox that prepared this runbook is aarch64 Linux with no route to the private Mini,
no `tmux`, no Keychain, and no Chrome — so it could not run the checks itself. Hence the harness.

---

## Acceptance criteria → checks

The busy / needs-input vocabulary these map to is already fixed in
`src/vue/features/sessions/session-state.mjs`: **OSC 0 title spinner / OSC 9;4 → busy (working)**,
**OSC 9 → attention (needsInput)**. The captures must carry exactly those sequences.

### AC1 — OSC 0 titles (spinner / idle) reach the client
- Command: `./scripts/vin-151-verify.sh osc9`
- Capture: `vin-151-captures/osc.raw` (inspect with `cat -v osc.raw`)
- Proven by: the string `VIN151-OSC0-TITLE` appearing in the raw client stream.
- Observed: _____
- Verdict: _____

### AC2 — OSC 9 notifications (permission / attention) reach the client
- Command: same capture as AC1.
- Proven by: `VIN151-OSC9-NOTIFY` (attention) and `;4;1;50` (OSC 9;4 busy) in `osc.raw`.
- **Key risk this check settles:** does tmux forward Claude's OSC 9 *bare*, or only when wrapped
  in tmux passthrough (`ESC Ptmux; … ESC \`)? The emitter sends both; the harness scans for the
  bare markers *and* `VIN151-WRAP9`. Whichever survives decides whether the remote launch needs
  `allow-passthrough on` to be enough, or whether Claude's own OSC must be wrapped.
- Observed (bare vs wrapped): _____
- Verdict: _____

### AC3 — scrollback inside tmux
- Command: `./scripts/vin-151-verify.sh scrollback` (prints the two configs to compare), then
  launch each by hand and scroll Claude's transcript.
- Compare: default (alternate screen captured, history via tmux copy-mode — but prefix is None,
  so copy-mode needs a binding or mouse) vs `set -g alternate-screen off` (terminal's own
  scrollbar keeps history; redraw cost on resize/reattach).
- Recommendation: _____
- ADR 0016 Consequences amended? _____

### AC4 — `$SHELL -lc` resolves tmux + claude; detach survives; `new -A` redraws
- Commands: `./scripts/vin-151-verify.sh path` then `./scripts/vin-151-verify.sh detach`
- Captures: `path.txt` (tmux + claude paths and versions), `detach-start.txt`, `detach-list.txt`
  (the session must still be listed after the ssh drops), then the by-hand `new -A` re-attach.
- Observed paths / versions: _____
- Survived detach? _____  Redrew on re-attach? _____

### AC5 — Auth on a headless Mac (manual, not in the harness — needs the real Keychain/token)
- Keychain over SSH: `ssh -tt mac-mini -- $SHELL -lc 'claude -p "say ok"'` with **no** token file
  present. Does it reach the subscription, or fail for lack of an interactive Keychain unlock?
  - Observed: _____
- Token file: create `<CLAUDE_CONFIG_DIR>/.oauth-token` from `claude setup-token`, then launch
  with `CLAUDE_CONFIG_DIR=<dir>` and confirm `claude -p` works headless.
  - Observed: _____
- Isolation: two `CLAUDE_CONFIG_DIR`s with different `.oauth-token`s stay on different
  subscriptions (and `CLAUDE_CODE_OAUTH_TOKEN` must **not** be exported for the Unix user, or it
  overrides `CLAUDE_CONFIG_DIR` — ADR 0016).
  - Observed: _____
- Verdict / ADR change: _____

### AC6 — `--chrome` over SSH on the headless Mini
- Chrome runs in the auto-logged-in GUI session; the SSH launch is headless. Run
  `ssh -tt mac-mini -- $SHELL -lc 'claude --chrome …'` and record whether it attaches to the GUI
  Chrome, launches its own, or fails.
- Verdict (keep the option, or hide `--chrome` in the remote NewSessionDialog): _____

### AC7 — any change to the launch command
- Record every deviation from the shape in `tmux_launch()` here and in ADR 0016 Consequences: _____

---

## Seams under test

Derived from the acceptance criteria — the boundaries behavior is observed at, without reaching
inside any app internal (there is no app code in this spike):

1. **The client's raw PTY byte stream** out of `ssh -tt` + `tmux -L wootonpad` — observed via
   `script(1)` capture. AC1, AC2 live here: an OSC sequence either crosses tmux into this stream
   or it does not. This is the critical seam the whole State Dot depends on.
2. **The tmux socket `wootonpad`** — `tmux -L wootonpad ls` and session lifecycle across an ssh
   drop. AC4 (detach/survive/re-attach) lives here.
3. **`$SHELL -lc`'s resolved environment** on the Mini — whether `tmux` and `claude` are on PATH
   under a login shell. AC4.
4. **`claude`'s own exit/auth boundary** under a given `CLAUDE_CONFIG_DIR` / `.oauth-token` —
   does a headless non-interactive invocation authenticate? AC5.
5. **`claude --chrome`'s success/failure** on a headless-but-GUI-logged-in host. AC6.

Scrollback (AC3) is a human readability judgement, not a programmatic seam; the harness only sets
the two configurations side by side.
