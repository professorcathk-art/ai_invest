#!/bin/zsh
set -euo pipefail

# Install / refresh InvestMouse launchd jobs on this iMac.
# Does not stop a scrape that is already running.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UID_NUM="$(id -u)"
AGENTS="$HOME/Library/LaunchAgents"

/usr/bin/python3 "$ROOT/scripts/generate_launchd.py"

mkdir -p "$HOME/Library/Logs" "$AGENTS"
chmod +x "$ROOT/scripts/run_ownership_sync.sh" "$ROOT/scripts/run_shortsell_sync.sh" "$ROOT/scripts/run_industry_digest.sh" "$ROOT/scripts/run_vc_pe_sync.sh" "$ROOT/scripts/run_filings_sync.sh" "$ROOT/scripts/sync_public_feeds.sh" "$ROOT/scripts/warm_books.sh" "$ROOT/scripts/sync_ccass.py" "$ROOT/scripts/sync_shortsell.py" "$ROOT/scripts/sync_vc_pe.py" "$ROOT/scripts/sync_filings.py"

new_jobs=(
  com.investmouse.ccass-hk-1
  com.investmouse.ccass-hk-2
  com.investmouse.ccass-hk-3
  com.investmouse.ccass-retry
  com.investmouse.us-ownership
  com.investmouse.public-feeds
  com.investmouse.warm-books
  com.investmouse.hkex-shortsell
  com.investmouse.industry-digest
  com.investmouse.vc-pe
  com.investmouse.filings
)

for label in "${new_jobs[@]}"; do
  src="$ROOT/scripts/launchd/${label}.plist"
  dest="$AGENTS/${label}.plist"
  cp "$src" "$dest"
  launchctl bootout "gui/${UID_NUM}/${label}" 2>/dev/null || true
  if ! launchctl bootstrap "gui/${UID_NUM}" "$dest"; then
    echo "bootstrap failed $label — left existing agent in place"
  else
    echo "loaded $label"
  fi
  launchctl enable "gui/${UID_NUM}/${label}" 2>/dev/null || true
done

# Old single 18:30 job duplicates the 19:00 shards. Disable future runs; do not kill tonight.
if launchctl print "gui/${UID_NUM}/com.investmouse.ownership-sync" >/dev/null 2>&1; then
  if pgrep -f 'run_ownership_sync.sh' >/dev/null 2>&1; then
    echo "Tonight's ownership-sync is still running — left it alive, disabled the next 18:30 fire."
  fi
  launchctl disable "gui/${UID_NUM}/com.investmouse.ownership-sync" 2>/dev/null || true
fi

echo
echo "Installed jobs:"
launchctl list | grep investmouse || true
echo
echo "Logs: $HOME/Library/Logs/investmouse-*.log"
