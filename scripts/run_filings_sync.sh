#!/bin/zsh
set -euo pipefail

# Sunday job: official annual reports → Supabase company-filings bucket.
#   zsh scripts/run_filings_sync.sh
#   zsh scripts/run_filings_sync.sh NVDA 0700.HK

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f "$ROOT/.env.local" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env.local"
  set +a
fi

if [[ -z "${NEXT_PUBLIC_SUPABASE_URL:-}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing in .env.local" >&2
  exit 2
fi

PYTHON="${INVESTMOUSE_PYTHON:-/Library/Frameworks/Python.framework/Versions/3.9/bin/python3}"
exec "$PYTHON" "$ROOT/scripts/sync_filings.py" "$@"
