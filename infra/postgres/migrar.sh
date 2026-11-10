#!/bin/sh
# Aplica, em ordem, as migrações de /migracoes que ainda não constam em schema_migrations.
# Cada arquivo roda numa transação junto com o registro da versão: ou entra inteiro, ou nada.
# Conexão pelas variáveis padrão do libpq (PGHOST, PGUSER, PGPASSWORD, PGDATABASE).
set -eu

psql_() { psql -X -q -v ON_ERROR_STOP=1 "$@"; }

psql_ -c "CREATE TABLE IF NOT EXISTS schema_migrations (
  versao      TEXT PRIMARY KEY,
  aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
)"

for arquivo in /migracoes/*.sql; do
  versao=$(basename "$arquivo" .sql)
  if [ "$(psql_ -tA -c "SELECT 1 FROM schema_migrations WHERE versao = '$versao'")" = 1 ]; then
    continue
  fi
  echo "aplicando $versao"
  psql_ --single-transaction -f "$arquivo" \
    -c "INSERT INTO schema_migrations (versao) VALUES ('$versao')"
done
echo "banco $PGDATABASE em dia"
