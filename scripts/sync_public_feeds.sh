#!/bin/zsh
set -euo pipefail

# Warm public RSS / research pages so sector and private-market tabs stay populated.
# Optional iMac launchd: scripts/com.investmouse.public-feeds.plist (hourly).
#   launchctl unload ~/Library/LaunchAgents/com.investmouse.public-feeds.plist 2>/dev/null || true
#   ln -sf "$PWD/scripts/com.investmouse.public-feeds.plist" ~/Library/LaunchAgents/
#   launchctl load ~/Library/LaunchAgents/com.investmouse.public-feeds.plist

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.local"
  set +a
fi

# shellcheck disable=SC1091
source "$ROOT/scripts/job_site.sh"

SITE="$(investmouse_job_site)"

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Warming public feeds via $SITE"

curl -fsS -o /dev/null -w "industry-dates %{http_code}\n" "$SITE/api/industry-research?sector=ai&lang=en&dates=1" || true
curl -fsS -o /dev/null -w "private-market %{http_code}\n" "$SITE/api/private-market" || true
if [[ -n "${RESEARCH_INGEST_TOKEN:-}" ]]; then
  curl -fsS -o /dev/null -w "private-digest %{http_code}\n" \
    -X POST "$SITE/api/private-market/ingest" \
    -H "Authorization: Bearer $RESEARCH_INGEST_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{}" || true
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

while IFS="|" read -r name feed; do
  code="$(curl -sS -o "$tmp" -w "%{http_code}" -A "InvestMouse/1.0" "$feed" || echo 000)"
  count="$(grep -c "<item" "$tmp" 2>/dev/null || echo 0)"
  echo "rss $name $code items~$count"
done <<'EOF'
yahoo|https://feeds.finance.yahoo.com/rss/2.0/headline?s=NVDA&region=US&lang=en-US
techcrunch|https://techcrunch.com/category/venture/feed/
crunchbase|https://news.crunchbase.com/feed/
bbc|https://feeds.bbci.co.uk/news/business/rss.xml
EOF
