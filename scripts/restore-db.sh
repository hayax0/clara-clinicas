#!/usr/bin/env bash
set -euo pipefail

# Restauração segura de backup PostgreSQL (.dump) da Clara com validação de checksum e confirmação interativa.
# Uso: ./scripts/restore-db.sh <arquivo.dump> [TARGET_DATABASE_URL]

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 <arquivo.dump> [TARGET_DATABASE_URL]" >&2
  exit 1
fi

DUMP_FILE="$1"
TARGET_URL="${2:-${TARGET_DATABASE_URL:-${DATABASE_URL:-}}}"

if [[ ! -f "${DUMP_FILE}" ]]; then
  echo "Erro: arquivo de backup não encontrado: ${DUMP_FILE}" >&2
  exit 1
fi

if [[ -z "${TARGET_URL}" ]]; then
  echo "Erro: informe TARGET_DATABASE_URL como segundo argumento ou via variável de ambiente." >&2
  exit 1
fi

for cmd in pg_restore psql; do
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Erro: comando obrigatório não encontrado: ${cmd}" >&2
    exit 1
  fi
done

SHA_FILE="${DUMP_FILE}.sha256"
if [[ -f "${SHA_FILE}" ]]; then
  echo "Validando integridade SHA-256..."
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c "${SHA_FILE}"
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "${SHA_FILE}"
  fi
fi

echo "Verificando conexão com o banco de destino..."
psql "${TARGET_URL}" -c "SELECT current_database();"

echo ""
echo "ATENÇÃO: esta operação sobrescreverá objetos existentes no banco de destino."
read -r -p "Digite RESTAURAR para confirmar: " CONFIRM
if [[ "${CONFIRM}" != "RESTAURAR" ]]; then
  echo "Operação cancelada pelo operador."
  exit 1
fi

echo "Restaurando ${DUMP_FILE}..."
pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --single-transaction \
  --dbname="${TARGET_URL}" \
  "${DUMP_FILE}"

echo "Restauração concluída com sucesso."
