#!/bin/zsh
set -euo pipefail

# Write the Hong Kong calendar week's sector digests (Monday start).
# Weekdays refresh the current week. Monday also archives last week.
#   zsh scripts/run_industry_digest.sh
#   zsh scripts/run_industry_digest.sh --last

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

if [[ -z "${RESEARCH_INGEST_TOKEN:-}" ]]; then
  echo "RESEARCH_INGEST_TOKEN missing in .env.local" >&2
  exit 2
fi

SITE="$(investmouse_job_site)"
THIS_MON="$(TZ=Asia/Hong_Kong date -v-mon +%Y-%m-%d)"
LAST_MON="$(TZ=Asia/Hong_Kong date -v-mon -v-1w +%Y-%m-%d)"
DOW="$(TZ=Asia/Hong_Kong date +%u)"

write_week() {
  local date="$1"
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Writing weekly industry digest $date via $SITE"
  for sector in ai china-internet ev biotech consumer; do
    for lang in zh en; do
      code="$(
        curl -sS -o /tmp/investmouse-digest.json -w "%{http_code}" \
          -X POST "$SITE/api/industry-research/ingest" \
          -H "Authorization: Bearer $RESEARCH_INGEST_TOKEN" \
          -H "Content-Type: application/json" \
          -d "{\"sector\":\"$sector\",\"locale\":\"$lang\",\"date\":\"$date\",\"force\":true}" \
          || echo 000
      )"
      echo "digest $date $sector $lang $code $(head -c 180 /tmp/investmouse-digest.json 2>/dev/null || true)"
    done
  done
}

if [[ "${1:-}" == "--last" ]]; then
  write_week "$LAST_MON"
  exit 0
fi

write_week "$THIS_MON"
if [[ "$DOW" == "1" || "${1:-}" == "--week" ]]; then
  write_week "$LAST_MON"
fi
