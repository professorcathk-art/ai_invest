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

PYTHON="${INVESTMOUSE_PYTHON:-/Library/Frameworks/Python.framework/Versions/3.9/bin/python3}"
export PYTHONPATH="$ROOT/scripts${PYTHONPATH:+:$PYTHONPATH}"

exec "$PYTHON" "$ROOT/scripts/sync_shortsell.py" "$@"
