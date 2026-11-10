#!/bin/bash
# Entrypoint da réplica (postgres-2): na primeira subida clona o primário com pg_basebackup e
# sobe em hot standby (standby.signal + primary_conninfo, gerados pelo -R). Se o volume já
# tem um banco (réplica antiga ou nó promovido), só sobe com o que está lá.
set -euo pipefail

PRIMARIO=${PRIMARIO:-postgres}

if [ ! -s "$PGDATA/PG_VERSION" ]; then
  mkdir -p "$PGDATA"
  chown postgres:postgres "$PGDATA"
  chmod 700 "$PGDATA"
  until gosu postgres pg_isready -q -h "$PRIMARIO" -U replicador -d postgres; do
    echo "esperando o primário $PRIMARIO"
    sleep 2
  done
  echo "clonando $PRIMARIO"
  gosu postgres env PGPASSWORD=replicador \
    pg_basebackup -h "$PRIMARIO" -U replicador -D "$PGDATA" -X stream -R --checkpoint=fast
fi

exec docker-entrypoint.sh "$@"
