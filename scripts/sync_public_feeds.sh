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

if [[ -n "${INVESTMOUSE_SITE_URL:-}" ]]; then
  SITE="$INVESTMOUSE_SITE_URL"
elif [[ -n "${INVESTMOUSE_API_URL:-}" ]]; then
  SITE="${INVESTMOUSE_API_URL%/api/*}"
else
  SITE="http://127.0.0.1:3030"
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Warming public feeds via $SITE"

curl -fsS -o /dev/null -w "industry-ai %{http_code}\n" "$SITE/api/industry-research?sector=ai&lang=en" || true
curl -fsS -o /dev/null -w "industry-china %{http_code}\n" "$SITE/api/industry-research?sector=china-internet&lang=zh" || true
curl -fsS -o /dev/null -w "private-market %{http_code}\n" "$SITE/api/private-market" || true

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
