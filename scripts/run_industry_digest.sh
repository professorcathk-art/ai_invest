#!/bin/zsh
set -euo pipefail

# Write yesterday's (HKT) sector digests. One POST per sector / locale.
#   zsh scripts/run_industry_digest.sh
#   zsh scripts/run_industry_digest.sh --today

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

if [[ -n "${INVESTMOUSE_SITE_URL:-}" ]]; then
  SITE="$INVESTMOUSE_SITE_URL"
elif [[ -n "${INVESTMOUSE_API_URL:-}" ]]; then
  SITE="${INVESTMOUSE_API_URL%/api/*}"
else
  SITE="http://127.0.0.1:3030"
fi

if [[ "${1:-}" == "--today" ]]; then
  DATE="$(TZ=Asia/Hong_Kong date +%Y-%m-%d)"
else
  DATE="$(TZ=Asia/Hong_Kong date -v-1d +%Y-%m-%d)"
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Writing industry digests for $DATE via $SITE"

for sector in ai china-internet ev biotech consumer; do
  for lang in zh en; do
    code="$(
      curl -sS -o /tmp/investmouse-digest.json -w "%{http_code}" \
        -X POST "$SITE/api/industry-research/ingest" \
        -H "Authorization: Bearer $RESEARCH_INGEST_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"sector\":\"$sector\",\"locale\":\"$lang\",\"date\":\"$DATE\"}" \
        || echo 000
    )"
    echo "digest $DATE $sector $lang $code $(head -c 180 /tmp/investmouse-digest.json 2>/dev/null || true)"
  done
done
