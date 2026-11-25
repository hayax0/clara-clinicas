#!/usr/bin/env bash
set -euo pipefail

# Verificação de saúde operacional da Clara (PostgreSQL, API 4311 e Web 4310).
# Uso: ./scripts/health-check.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" && -f "${ROOT_DIR}/.env" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "${ROOT_DIR}/.env" | head -n 1 | cut -d '=' -f 2- | tr -d '"'\''')"
  export DATABASE_URL
fi

API_URL="${API_HEALTH_URL:-http://127.0.0.1:4311/api/health}"
WEB_URL="${WEB_HEALTH_URL:-http://127.0.0.1:4310}"
FAILED=0

echo "== Healthcheck Clara =="

if [[ -n "${DATABASE_URL:-}" ]] && command -v psql >/dev/null 2>&1; then
  if psql "${DATABASE_URL}" -c "SELECT 1;" >/dev/null 2>&1; then
    echo "[OK]   PostgreSQL respondendo"
  else
    echo "[FAIL] PostgreSQL inacessível"
    FAILED=1
  fi
else
  echo "[WARN] PostgreSQL não verificado (defina DATABASE_URL e garanta psql no PATH)"
fi

if curl -sf --max-time 5 "${API_URL}" >/dev/null 2>&1; then
  echo "[OK]   API respondendo em ${API_URL}"
else
  echo "[FAIL] API indisponível em ${API_URL}"
  FAILED=1
fi

if curl -sf --max-time 5 "${WEB_URL}" >/dev/null 2>&1; then
  echo "[OK]   Web respondendo em ${WEB_URL}"
else
  echo "[FAIL] Web indisponível em ${WEB_URL}"
  FAILED=1
fi

exit "${FAILED}"
