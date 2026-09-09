#!/bin/zsh
set -euo pipefail

# Warm Yahoo+FMP books into financial_snapshots via the local (or Vercel) site.
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
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Warming ticker books via $SITE"

tickers=(0700.HK 0005.HK 9988.HK 1810.HK 3690.HK NVDA AAPL MSFT TSLA 0388.HK)
for ticker in "${tickers[@]}"; do
  encoded="${ticker//\//%2F}"
  code="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 90 "$SITE/api/ticker/${encoded}?lang=en" || echo 000)"
  echo "ticker $ticker $code"
done
