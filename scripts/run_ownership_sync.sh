#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.local"
  set +a
fi

if [[ -z "${RESEARCH_INGEST_TOKEN:-}" ]]; then
  echo "RESEARCH_INGEST_TOKEN missing in .env.local" >&2
  exit 2
fi

if [[ -z "${INVESTMOUSE_API_URL:-}" ]]; then
  echo "Add INVESTMOUSE_API_URL to .env.local, e.g. https://your-app.vercel.app/api/ownership/ingest" >&2
  exit 2
fi

PYTHON="${INVESTMOUSE_PYTHON:-/Library/Frameworks/Python.framework/Versions/3.9/bin/python3}"
LIST_FILE="$ROOT/scripts/ownership_tickers.txt"
export PYTHONPATH="$ROOT/scripts${PYTHONPATH:+:$PYTHONPATH}"

tickers=()
if [[ -n "${OWNERSHIP_TICKERS:-}" ]]; then
  tickers=(${=OWNERSHIP_TICKERS})
elif [[ -f "$LIST_FILE" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    ticker="${line%%#*}"
    ticker="${ticker//[[:space:]]/}"
    [[ -n "$ticker" ]] && tickers+=("$ticker")
  done < "$LIST_FILE"
else
  tickers=(9988.HK 0700.HK NVDA AAPL)
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Syncing ${#tickers[@]} tickers"
failed=0
for ticker in "${tickers[@]}"; do
  "$PYTHON" "$ROOT/scripts/sync_ccass.py" "$ticker" || failed=1
done
exit "$failed"
