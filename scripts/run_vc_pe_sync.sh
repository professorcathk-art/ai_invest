#!/bin/zsh
set -euo pipefail

# Daily a16z / Y Combinator public-page monitor.
#   zsh scripts/run_vc_pe_sync.sh

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

exec /usr/bin/python3 "$ROOT/scripts/sync_vc_pe.py"
