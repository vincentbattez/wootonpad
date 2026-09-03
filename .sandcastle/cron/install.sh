#!/bin/zsh
# Install (or refresh) the hourly launchd job that runs the orchestrator.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
LABEL=com.vb.sandcastle
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

mkdir -p "$HOME/.local/bin" "$HOME/Library/Logs/sandcastle"
install -m 755 "$HERE/sandcastle-run.sh" "$HOME/.local/bin/sandcastle-run.sh"
install -m 644 "$HERE/$LABEL.plist" "$PLIST"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl print "gui/$(id -u)/$LABEL" | grep -E 'state|interval' || true
echo "installed: $LABEL ticks hourly; logs in ~/Library/Logs/sandcastle/"
