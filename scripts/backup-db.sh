#!/usr/bin/env bash
set -euo pipefail

# Backup comprimido (formato custom) do PostgreSQL da Clara com checksum SHA-256.
# Uso: DATABASE_URL=postgresql://... ./scripts/backup-db.sh [diretorio_destino]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ -z "${DATABASE_URL:-}" && -f "${ROOT_DIR}/.env" ]]; then
  # Carrega apenas DATABASE_URL sem expor outras variáveis
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "${ROOT_DIR}/.env" | head -n 1 | cut -d '=' -f 2- | tr -d '"'\''')"
  export DATABASE_URL
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Erro: defina DATABASE_URL no ambiente ou em .env antes de executar o backup." >&2
  exit 1
fi

for cmd in pg_dump psql; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Erro: comando obrigatório não encontrado: ${cmd}" >&2
    exit 1
  fi
done

OUT_DIR="${1:-${ROOT_DIR}/backups}"
mkdir -p "${OUT_DIR}"

echo "Verificando conexão com o PostgreSQL..."
psql "${DATABASE_URL}" -c "SELECT 1;" >/dev/null

TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
DUMP_FILE="${OUT_DIR}/clara-${TIMESTAMP}.dump"
SHA_FILE="${DUMP_FILE}.sha256"

echo "Gerando backup comprimido em ${DUMP_FILE}..."
pg_dump --format=custom --no-owner --no-privileges --file="${DUMP_FILE}" "${DATABASE_URL}"

if command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "${DUMP_FILE}" > "${SHA_FILE}"
elif command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${DUMP_FILE}" > "${SHA_FILE}"
else
  echo "Aviso: shasum/sha256sum não encontrado; checksum não gerado." >&2
fi

echo "Backup concluído com sucesso:"
echo "  Arquivo:  ${DUMP_FILE}"
if [[ -f "${SHA_FILE}" ]]; then
  echo "  SHA-256:  $(cat "${SHA_FILE}")"
fi
