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
#   ./scripts/vin-151-verify.sh osc9         # AC1+AC2 (SYNTHETIC stub): OSC 0 title + OSC 9 notify transport
#   ./scripts/vin-151-verify.sh osc9-real    # AC1+AC2 (REAL claude): Claude's own OSC 0/OSC 9 across the seam
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
  # SOCKET and session are spliced into the REMOTE command text (inside
  # `$SHELL -lc '…'`), so unlike $remote_cmd they are not protected by the
  # env-passing in the callers — that only guards the LOCAL `bash -c` program
  # text. Validate them as bare tokens here so a quote/metachar cannot break out
  # of the remote single-quoting and the "passed safely" claim actually holds.
  case "$SOCKET" in ''|*[!A-Za-z0-9_-]*) echo "!! SOCKET must be a bare token [A-Za-z0-9_-]: '$SOCKET'" >&2; return 2 ;; esac
  case "$session" in ''|*[!A-Za-z0-9_-]*) echo "!! session must be a bare token [A-Za-z0-9_-]: '$session'" >&2; return 2 ;; esac
  # NOTE: $remote_cmd is spliced UNQUOTED into the tmux command line on purpose,
  # so a multi-word command word-splits into new-session's argv. Every caller
  # passes a hardcoded command ('claude', '/tmp/vin151-emit.sh', 'claude -p ok'),
  # so this is safe here; do not feed it untrusted input without quoting first.
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
  # BatchMode=yes: fail rather than block on any interactive prompt (password,
  # passphrase, keyboard-interactive). It does NOT govern host-key policy —
  # that is StrictHostKeyChecking — so the Mini must already be a known host.
  ssh -tt -o BatchMode=yes "$HOST" -- "\$SHELL -lc '${tmux_cmd}'"
}

have_script() { command -v script >/dev/null 2>&1; }

# Capture a short-lived launch under script(1) so client-side bytes are on disk.
# macOS `script` syntax: script -q <file> <cmd...>
capture() {
  local file="$1"; shift
  if ! have_script; then
    # Without script(1) there is no capture file, and scan() would then cat -v a
    # missing file and report every marker `absent` — a fabricated clean result
    # for a spike whose whole point is evidence, not assertion. So we refuse to
    # scan. But RETURN non-zero rather than `exit`: an `exit` here would abort the
    # whole `all` run at the first capture check (osc9) and silently drop the
    # remaining, capture-INDEPENDENT ACs (osc9-real shares this, but path/detach/
    # scrollback do not need script(1) and must still run). Callers treat a
    # non-zero return as "skip just this capture-dependent check" and continue.
    echo "!! script(1) not found; cannot capture client-side bytes for this check." >&2
    echo "   Skipping it. Install script(1) or run the launch by hand under" >&2
    echo "   script/tee, then re-run this subcommand." >&2
    return 3
  fi
  script -q "$file" "$@" </dev/null
}

# kill_session <session> — tear down a session on the wootonpad socket. The one
# place the kill shape lives; osc9_real and detach both go through it.
kill_session() {
  ssh -o BatchMode=yes "$HOST" -- "\$SHELL -lc 'tmux -L ${SOCKET} kill-session -t $1'" 2>/dev/null || true
}

# run_launch <rawfile> <session> <remote_cmd> — capture ONE ADR launch under
# script(1). HOST/SOCKET go through the ENVIRONMENT (not spliced into the local
# `bash -c` program text), so a metachar in either cannot break or inject into
# it; tmux_launch then validates SOCKET/session before splicing them remotely.
# The single source of the capture+launch shape, shared by osc9 and osc9_real.
run_launch() {
  local raw="$1" session="$2" remote_cmd="$3"
  capture "$raw" env HOST="$HOST" SOCKET="$SOCKET" \
    bash -c "$(declare -f tmux_launch); tmux_launch $session '$remote_cmd'"
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
#
# COVERAGE CAVEAT: this emitter is a printf STUB, not Claude. It proves that
# tmux + ssh -tt forward *a synthetic* OSC 0 / OSC 9 to the client — the
# transport seam AC1/AC2 care about. It does NOT prove that Claude's own
# emissions (whose exact byte form and timing we do not control) survive that
# seam. That remains unverified; see the drive-real-Claude follow-up noted in
# the runbook under AC1/AC2. Treat the stub result as transport evidence only.
# -----------------------------------------------------------------------------
push_emitter() {
  ssh -o BatchMode=yes "$HOST" 'cat > /tmp/vin151-emit.sh' <<'EMIT'
#!/bin/sh
# OSC 0 title (what WootonPad reads for spinner/sleeping)
printf '\033]0;VIN151-OSC0-TITLE\007'
# OSC 9 generic notification (needsInput)
printf '\033]9;VIN151-OSC9-NOTIFY\007'
# OSC 9;4 progress (the Working variant). Beyond AC1/AC2 (which name only OSC 0
# and OSC 9); emitted because it maps to the Working state WootonPad shows.
printf '\033]9;4;1;50\007'
# The same two, wrapped in tmux passthrough (ESC Ptmux; ESC <seq> ESC \)
printf '\033Ptmux;\033\033]0;VIN151-WRAP0\007\033\\'
printf '\033Ptmux;\033\033]9;VIN151-WRAP9\007\033\\'
sleep 2
EMIT
  ssh -o BatchMode=yes "$HOST" 'chmod +x /tmp/vin151-emit.sh'
}

osc9() {
  echo "== AC1/AC2: OSC 0 + OSC 9 through ssh -tt + tmux (SYNTHETIC emitter) =="
  push_emitter || { echo "!! could not push emitter (host unreachable?)"; return 1; }
  # The stub now exists in the Mini's shared /tmp. Remove it on ANY exit path
  # (an interrupt during capture, an early return below, or normal completion)
  # so no world-readable stub is left behind in the shared /tmp. An EXIT trap is
  # the one cleanup that fires regardless of which path we leave by.
  trap 'ssh -o BatchMode=yes "$HOST" "rm -f /tmp/vin151-emit.sh" 2>/dev/null || true' EXIT
  local raw="$OUT/osc.raw"
  if ! run_launch "$raw" wp-osc '/tmp/vin151-emit.sh'; then
    echo "   (AC1/AC2 synthetic check skipped — see message above; other ACs continue)"
    return 0
  fi
  echo "raw bytes -> $raw"
  scan "$raw" "OSC0 title (bare)"      'VIN151-OSC0-TITLE'
  scan "$raw" "OSC9 notify (bare)"     'VIN151-OSC9-NOTIFY'
  scan "$raw" "OSC9;4 progress (bare)" ';4;1;50'
  scan "$raw" "OSC0 (tmux-wrapped)"    'VIN151-WRAP0'
  scan "$raw" "OSC9 (tmux-wrapped)"    'VIN151-WRAP9'
  echo "   NOTE: whichever form survives tells you if Claude must wrap its OSC."
  echo "   NOTE: this is the SYNTHETIC-stub transport check; the REAL-Claude"
  echo "         path is 'osc9-real' (see runbook AC1/AC2)."
  # Leave no world-readable stub behind in the shared /tmp.
  ssh -o BatchMode=yes "$HOST" 'rm -f /tmp/vin151-emit.sh' 2>/dev/null || true
  trap - EXIT
}

# -----------------------------------------------------------------------------
# AC1 + AC2 (REAL Claude) — drive an actual `claude` through the ADR launch
# shape and scan its RAW client capture for Claude's own OSC 0 / OSC 9 bytes.
# The synthetic osc9() above proves only that tmux + ssh -tt forward *a stub*
# sequence; this path closes the end-to-end claim the spec makes — that OSC 0
# titles and OSC 9 notifications "emitted by Claude" reach the client — by
# exercising Claude's real emissions across the same seam.
# -----------------------------------------------------------------------------
osc9_real() {
  echo "== AC1/AC2: OSC 0 + OSC 9 from a REAL claude through ssh -tt + tmux =="
  # A SINGLE-TOKEN prompt only: tmux_launch splices its command word UNQUOTED
  # (by design), so a prompt with spaces/quotes would word-split and break the
  # launch. Override with a single shell word via WOOTON_CLAUDE_PROMPT.
  local prompt="${WOOTON_CLAUDE_PROMPT:-ok}"
  case "$prompt" in
    *[!A-Za-z0-9_-]*) echo "!! WOOTON_CLAUDE_PROMPT must be a single shell word (no spaces/quotes)"; return 2 ;;
  esac
  local raw="$OUT/osc-claude.raw"
  echo "-- launching: claude -p $prompt  (non-interactive; ends on its own) --"
  if ! run_launch "$raw" wp-osc-claude "claude -p $prompt"; then
    echo "   (AC1/AC2 real-Claude check skipped — see message above; other ACs continue)"
    return 0
  fi
  echo "raw bytes -> $raw"
  # cat -v renders ESC as ^[ ; match Claude's real OSC 0 / OSC 9 introducers.
  scan "$raw" "OSC 0 title (real claude)"  '\^\[]0;'
  scan "$raw" "OSC 9 notify (real claude)" '\^\[]9;'
  echo "   NOTE: these are Claude's OWN emissions — presence proves AC1/AC2 end"
  echo "         to end (claude → tmux → ssh -tt → client), not just transport."
  echo "   NOTE: print mode (-p) may emit fewer sequences than an interactive"
  echo "         session; if absent, also observe an interactive run by hand."
  kill_session wp-osc-claude
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
  echo "== AC4: killing an ATTACHED ssh leaves Claude running, new -A redraws =="
  echo "-- open an attached session running claude via the ADR launch shape --"
  # Route through tmux_launch() so the session under test carries the real ADR
  # options (prefix None, allow-passthrough on, …) and runs `claude`, not sleep.
  # Background the attached launch so we can drop the client out from under the
  # session, exactly as a dropped client would. (ssh -tt wants a tty on stdin;
  # run this harness from a real terminal so the backgrounded attach gets one.)
  #
  # NOTE: tmux_launch is a multi-command function, so `&` backgrounds a SUBSHELL
  # and $! is that subshell's PID, NOT the ssh client's. Killing the subshell
  # would orphan the ssh — it would stay attached, the drop would never happen,
  # and `tmux ls` would still show wp-detach, fabricating a clean pass. We must
  # kill the real ssh CLIENT process. An unanchored `pkill -f 'ssh .*wp-detach'`
  # would do that, but the pattern is a loose substring match: any OTHER ssh to
  # the Mini from this same dev machine whose argv merely contains "wp-detach"
  # (a path, another session, a scrollback buffer passed as an arg) would be
  # culled too. So we target THIS launch precisely: find the ssh that is a child
  # of our backgrounded subshell and kill it by PID. Only if that lookup finds
  # nothing do we fall back to a pattern anchored to this exact socket + session.
  tmux_launch wp-detach 'claude' >"$OUT/detach-start.txt" 2>&1 &
  local launch_pid=$!
  sleep 5   # let the attached session start claude inside tmux
  echo "-- drop the attached client: kill THIS launch's ssh by PID --"
  local ssh_pid
  ssh_pid=$(pgrep -P "$launch_pid" -f 'ssh ' | head -n1)
  if [ -n "$ssh_pid" ]; then
    echo "   ssh client pid=$ssh_pid"
    kill "$ssh_pid" 2>/dev/null || true
  else
    # Fallback: anchor to the socket AND session so an unrelated ssh to the Mini
    # (different socket/session) cannot match. Still narrower than 'ssh .*wp-detach'.
    echo "   (no child ssh found; falling back to an anchored pattern)"
    pkill -f "ssh .*-L ${SOCKET} new-session -A -s wp-detach" 2>/dev/null || true
  fi
  wait "$launch_pid" 2>/dev/null || true
  echo "-- list sessions on the socket; wp-detach (running claude) must survive --"
  ssh -o BatchMode=yes "$HOST" -- "\$SHELL -lc 'tmux -L ${SOCKET} ls'" | tee "$OUT/detach-list.txt"
  echo "-- re-attach with new -A and confirm the pane redraws claude's transcript --"
  echo "   RUN BY HAND (interactive): ssh -tt $HOST -- \$SHELL -lc 'tmux -L ${SOCKET} new -A -s wp-detach'"
  echo "-- clean up --"
  kill_session wp-detach
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
  osc9)       osc9 ;;
  osc9-real)  osc9_real ;;
  path)       path_check ;;
  detach)     detach ;;
  scrollback) scrollback ;;
  all)        path_check; echo; osc9; echo; osc9_real; echo; detach; echo; scrollback ;;
  *) echo "usage: $0 {all|osc9|osc9-real|path|detach|scrollback}"; exit 2 ;;
esac
