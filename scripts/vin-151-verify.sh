#!/usr/bin/env bash
#
# VIN-151 — Spike: SSH + tmux + Claude on a Remote Host
#
# Runs the exact launch shape from ADR 0016 against the real Remote Host and
# captures RAW client-side bytes, so each acceptance criterion is proved by
# evidence rather than assertion. Nothing here is app code; it is throw-away
# verification scaffolding for the spike.
#
# Run it ON THE MACBOOK (the Local Host), which is the machine that actually
# has `ssh mac-mini` reachable. The cloud agent sandbox cannot reach the Mini,
# which is why this exists as a hand-run harness.
#
#   ./scripts/vin-151-verify.sh all          # every check, in order
#   ./scripts/vin-151-verify.sh osc0         # AC1: OSC 0 title (spinner/idle)
#   ./scripts/vin-151-verify.sh osc9         # AC2: OSC 9 notification
#   ./scripts/vin-151-verify.sh path         # AC4: $SHELL -lc resolves tmux + claude
#   ./scripts/vin-151-verify.sh detach       # AC4: detach survives, new -A redraws
#   ./scripts/vin-151-verify.sh scrollback   # AC3: xterm scrollback vs tmux
#
# Raw captures land in ./vin-151-captures/ ; paste the relevant ones into the
# Linear comment and amend ADR 0016 from what they show.
#
set -uo pipefail

HOST="${WOOTON_HOST:-mac-mini}"
SOCKET="${WOOTON_SOCKET:-wootonpad}"
OUT="${WOOTON_OUT:-vin-151-captures}"
mkdir -p "$OUT"

# --- The launch shape, verbatim from ADR 0016 / VIN-150 -----------------------
# ssh -tt  →  $SHELL -lc  →  tmux -L wootonpad new -A -s wp-<id>, with prefix
# disabled, status off, passthrough + titles on, all inline (nothing written to
# the user's tmux config). Keep this the single source of truth a reviewer
# checks against the ADR. $REMOTE_CMD is substituted as the session's command.
tmux_launch() {
  local session="$1" remote_cmd="$2"
  # tmux options are set inline with `\; set -g`, after new-session.
  local tmux_cmd
  tmux_cmd=$(cat <<TMUX
tmux -L ${SOCKET} new-session -A -s ${session} ${remote_cmd:+${remote_cmd}} \
  \; set -g prefix None \
  \; set -g status off \
  \; set -g allow-passthrough on \
  \; set -g set-titles on
TMUX
)
  # $SHELL -lc, because a non-interactive SSH session has no Homebrew PATH.
  # BatchMode=yes: never answer a password prompt, never accept a host key.
  ssh -tt -o BatchMode=yes "$HOST" -- "\$SHELL -lc '${tmux_cmd}'"
}

have_script() { command -v script >/dev/null 2>&1; }

# Capture a short-lived launch under script(1) so client-side bytes are on disk.
# macOS `script` syntax: script -q <file> <cmd...>
capture() {
  local file="$1"; shift
  if ! have_script; then
    echo "!! script(1) not found; run the command by hand and tee it" >&2
    "$@"; return
  fi
  script -q "$file" "$@" </dev/null
}

scan() { # scan <rawfile> <label> <grep-pattern-for-cat-v>
  local f="$1" label="$2" pat="$3"
  printf '  %-28s ' "$label"
  if cat -v "$f" | grep -q "$pat"; then echo "FOUND  ($pat)"; else echo "absent ($pat)"; fi
}

# -----------------------------------------------------------------------------
# AC1 + AC2 — emit OSC 0 and OSC 9 inside tmux, prove they reach the client.
# The emitter is pushed to the Mac as a file to dodge nested-quoting hell, then
# run as the tmux session's command. We emit both the BARE sequences and the
# tmux-passthrough-WRAPPED forms, because the open question the spike answers is
# whether tmux forwards Claude's OSC 9 as-is or only when wrapped.
# -----------------------------------------------------------------------------
push_emitter() {
  ssh -o BatchMode=yes "$HOST" 'cat > /tmp/vin151-emit.sh' <<'EMIT'
#!/bin/sh
# OSC 0 title (what WootonPad reads for spinner/idle)
printf '\033]0;VIN151-OSC0-TITLE\007'
# OSC 9 generic notification (needs-input / attention)
printf '\033]9;VIN151-OSC9-NOTIFY\007'
# OSC 9;4 progress (the busy/working variant)
printf '\033]9;4;1;50\007'
# The same two, wrapped in tmux passthrough (ESC Ptmux; ESC <seq> ESC \)
printf '\033Ptmux;\033\033]0;VIN151-WRAP0\007\033\\'
printf '\033Ptmux;\033\033]9;VIN151-WRAP9\007\033\\'
sleep 2
EMIT
  ssh -o BatchMode=yes "$HOST" 'chmod +x /tmp/vin151-emit.sh'
}

osc0() { osc9; }  # same capture proves both; scanned separately below
osc9() {
  echo "== AC1/AC2: OSC 0 + OSC 9 through ssh -tt + tmux =="
  push_emitter || { echo "!! could not push emitter (host unreachable?)"; return 1; }
  local raw="$OUT/osc.raw"
  capture "$raw" bash -c "$(declare -f tmux_launch); HOST='$HOST' SOCKET='$SOCKET' tmux_launch wp-osc '/tmp/vin151-emit.sh'"
  echo "raw bytes -> $raw"
  scan "$raw" "OSC0 title (bare)"      'VIN151-OSC0-TITLE'
  scan "$raw" "OSC9 notify (bare)"     'VIN151-OSC9-NOTIFY'
  scan "$raw" "OSC9;4 progress (bare)" ';4;1;50'
  scan "$raw" "OSC0 (tmux-wrapped)"    'VIN151-WRAP0'
  scan "$raw" "OSC9 (tmux-wrapped)"    'VIN151-WRAP9'
  echo "   NOTE: whichever form survives tells you if Claude must wrap its OSC."
}

# -----------------------------------------------------------------------------
# AC4 — $SHELL -lc resolves tmux and claude; detach survives; new -A redraws.
# -----------------------------------------------------------------------------
path_check() {
  echo "== AC4: \$SHELL -lc resolves tmux + claude =="
  ssh -tt -o BatchMode=yes "$HOST" -- '$SHELL -lc "command -v tmux; command -v claude; tmux -V; claude --version"' \
    | tee "$OUT/path.txt"
}

detach() {
  echo "== AC4: detach survives, new -A re-attaches with a redraw =="
  echo "-- start a long-lived marker process in the session, then drop ssh --"
  ssh -tt -o BatchMode=yes "$HOST" -- "\$SHELL -lc 'tmux -L ${SOCKET} new-session -d -s wp-detach \"sh -c \\\"echo VIN151-ALIVE-\$(date +%s); sleep 600\\\"\"'" \
    | tee "$OUT/detach-start.txt"
  echo "-- (ssh dropped) list sessions on the socket; wp-detach must still be there --"
  ssh -o BatchMode=yes "$HOST" -- "\$SHELL -lc 'tmux -L ${SOCKET} ls'" | tee "$OUT/detach-list.txt"
  echo "-- re-attach with new -A and confirm the pane redraws the marker --"
  echo "   RUN BY HAND (interactive): ssh -tt $HOST -- \$SHELL -lc 'tmux -L ${SOCKET} new -A -s wp-detach'"
  echo "-- clean up --"
  ssh -o BatchMode=yes "$HOST" -- "\$SHELL -lc 'tmux -L ${SOCKET} kill-session -t wp-detach'" 2>/dev/null || true
}

# -----------------------------------------------------------------------------
# AC3 — scrollback. Observe what xterm-native scrollback does inside tmux and
# record which option keeps history readable. This one is a human observation;
# the harness only sets the two configurations up side by side.
# -----------------------------------------------------------------------------
scrollback() {
  echo "== AC3: scrollback — observe, then record the recommendation =="
  cat <<NOTE
  Two configurations to compare by hand inside the launched session:
   (a) default tmux: the app's alternate screen is captured; xterm-native
       scrollback shows tmux's view, history is reached via tmux copy-mode.
       With prefix None (ADR 0016) copy-mode has no key — so decide the binding
       or the mouse toggle.
   (b) set -g alternate-screen off: the app draws into the main screen, so the
       terminal's own scrollbar keeps the history, at the cost of redraw on
       resize/reattach.
  Launch each, scroll, and record which keeps Claude's transcript readable.
  Write the recommendation into ADR 0016 Consequences.
NOTE
}

case "${1:-all}" in
  osc0|osc9) osc9 ;;
  path)       path_check ;;
  detach)     detach ;;
  scrollback) scrollback ;;
  all)        path_check; echo; osc9; echo; detach; echo; scrollback ;;
  *) echo "usage: $0 {all|osc0|osc9|path|detach|scrollback}"; exit 2 ;;
esac
