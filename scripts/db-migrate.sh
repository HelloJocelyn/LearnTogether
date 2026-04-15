#!/usr/bin/env bash
# Apply SQLite schema migrations via SQLAlchemy init_db() (create_all + ALTER TABLE steps).
# Safe to run on deploy or any dev machine. Backs up an existing app.db before migrating.
#
# Usage (from repo root):
#   bash scripts/db-migrate.sh
#
# Optional environment overrides:
#   LEARNTOGETHER_ROOT   Repo root (default: parent directory of scripts/)
#   DB_FILE              Full path to SQLite file (default: $ROOT/backend/app.db)
#   APP_ENV              Passed through to Python (default: production)
#   CHECKIN_TZ           Default: Asia/Tokyo
#   CHECKIN_CONFIG_FILE  Default: $ROOT/backend/config/checkin_window.production.json
#
# Local dev example:
#   APP_ENV=local CHECKIN_CONFIG_FILE=backend/config/checkin_window.local.json bash scripts/db-migrate.sh

set -euo pipefail

ROOT="${LEARNTOGETHER_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
PY="${ROOT}/backend/.venv/bin/python"
DB_FILE="${DB_FILE:-${ROOT}/backend/app.db}"

if [ ! -f "$PY" ]; then
  echo "Python venv not found at backend/.venv. Create it first, e.g.:"
  echo "  cd ${ROOT}/backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi

echo "Preparing backend database migration..."
if [ -f "$DB_FILE" ]; then
  BACKUP_FILE="${DB_FILE}.bak.$(date +%Y%m%d%H%M%S)"
  cp "$DB_FILE" "$BACKUP_FILE"
  echo "Backed up existing DB: $BACKUP_FILE"
fi

export APP_ENV="${APP_ENV:-production}"
export CHECKIN_TZ="${CHECKIN_TZ:-Asia/Tokyo}"
export CHECKIN_CONFIG_FILE="${CHECKIN_CONFIG_FILE:-${ROOT}/backend/config/checkin_window.production.json}"

echo "Applying backend schema migrations (init_db)..."
(
  cd "${ROOT}/backend"
  "$PY" -c "from app.db import init_db; init_db(); print('init_db migration complete')"
)
