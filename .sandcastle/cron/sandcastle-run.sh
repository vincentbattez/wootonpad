#!/bin/zsh
# Cron entry point for the orchestrator. Installed by `.sandcastle/cron/install.sh`
# to ~/.local/bin and fired hourly by launchd (com.vb.sandcastle).
#
# The orchestrator does its own gating — lock, pause after an interruption —
# so this stays thin: a PATH launchd does not provide, and one cheap check to
# not start a run on a 5-hour window that is about to close anyway.
set -uo pipefail

PROJECT_DIR="${SANDCASTLE_PROJECT_DIR:-/Users/vincentbattez/lab/macosApp/wootonpad}"
MIN_QUOTA_LEFT_PCT="${SANDCASTLE_MIN_QUOTA_PCT:-25}"
SNAPSHOT="$HOME/.claude/rate-limits.json"

# launchd's PATH is minimal: Homebrew (gh, linear, jq, mise), ~/.local/bin, Docker.
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$HOME/.local/bin:/usr/local/bin:$PATH"

cd "$PROJECT_DIR" || exit 1
echo "=== $(date '+%Y-%m-%d %H:%M:%S') | sandcastle ${*:-(discover)} ==="

# Snapshot written by the Claude Code statusline hook. Fresh and nearly spent
# means the run would die within minutes; stale or absent means run anyway —
# the orchestrator reads the real answer off the first agent that fails.
if [ -f "$SNAPSHOT" ] && command -v jq >/dev/null; then
  read -r used resets captured < <(
    jq -r '[.five_hour.used_percentage, .five_hour.resets_at, .captured_at] | @tsv' "$SNAPSHOT" 2>/dev/null
  )
  now=$(date +%s)
  if [ -n "${used:-}" ] && (( now - captured < 6 * 3600 )) && (( now < resets )) \
     && (( 100 - used < MIN_QUOTA_LEFT_PCT )); then
    echo "skip: ${used}% of the 5h window used, resets at $(date -r "$resets" '+%H:%M')"
    exit 0
  fi
fi

exec /opt/homebrew/bin/mise exec -- npm run -s sandcastle "$@"
