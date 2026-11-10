#!/usr/bin/env bash
# Derruba o PostgreSQL primário, promove a réplica (postgres-2) e mostra que os relatos
# continuam sendo gravados. Com --restaurar, devolve os papéis originais (postgres primário,
# postgres-2 réplica) sem perder o que foi gravado durante a falha: o nó antigo é rebobinado
# com pg_rewind, vira réplica do novo, sincroniza e só então os papéis são trocados de volta.
#
#   infra/demo/falha-postgres.sh             # falha + failover
#   infra/demo/falha-postgres.sh --restaurar # volta ao normal
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env ]] && set -a && . ./.env && set +a
api="${ECOPULSE_API:-http://localhost:${API_PORT:-8000}}"

sql(){ docker compose exec -T "$1" psql -U ecopulse -d ecopulse -tAc "$2"; }
no_de_pe(){ [ -n "$(docker compose ps --status running -q "$1")" ]; }
papel(){
  if ! no_de_pe "$1"; then echo "parado"; return; fi
  case "$(sql "$1" 'select pg_is_in_recovery()' 2>/dev/null || echo erro)" in
    f) echo "primário" ;; t) echo "réplica" ;; *) echo "subindo" ;;
  esac
}
mostrar_papeis(){ echo "  postgres: $(papel postgres) · postgres-2: $(papel postgres-2)"; }

esperar_aceitar(){
  for _ in $(seq 1 60); do
    sql "$1" 'select 1' >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "ERRO: $1 não subiu"; exit 1
}

# Para $1, rebobina seus dados a partir do primário $2 e o sobe como réplica de $2.
tornar_replica(){
  local no=$1 fonte=$2
  docker compose stop -t 60 "$no" >/dev/null 2>&1
  docker compose run --rm --no-deps --entrypoint bash -e PGPASSWORD=ecopulse "$no" -c "
    set -e
    gosu postgres pg_rewind --target-pgdata=\"\$PGDATA\" \
      --source-server='host=$fonte port=5432 user=ecopulse dbname=ecopulse'
    touch \"\$PGDATA/standby.signal\"
    # o pg_rewind copia o postgresql.auto.conf da fonte; a última linha vale
    echo \"primary_conninfo = 'host=$fonte port=5432 user=replicador password=replicador application_name=$no'\" \
      >> \"\$PGDATA/postgresql.auto.conf\"
    chown postgres:postgres \"\$PGDATA/standby.signal\" \"\$PGDATA/postgresql.auto.conf\"
  " >/dev/null 2>&1
  docker compose up -d --no-deps "$no" >/dev/null 2>&1
  esperar_aceitar "$no"
}

esperar_sincronia(){
  local replica=$1 primario=$2
  for _ in $(seq 1 120); do
    alvo=$(sql "$primario" 'select pg_current_wal_lsn()')
    feito=$(sql "$replica" 'select pg_last_wal_replay_lsn()')
    [ "$(sql "$primario" "select '$feito'::pg_lsn >= '$alvo'::pg_lsn")" = t ] && return 0
    sleep 1
  done
  echo "ERRO: $replica não alcançou $primario"; exit 1
}

if [ "${1:-}" = "--restaurar" ]; then
  echo "Antes:"; mostrar_papeis
  if [ "$(papel postgres)" = "primário" ]; then echo "Nada a restaurar"; exit 0; fi
  [ "$(papel postgres-2)" = "primário" ] || { echo "ERRO: postgres-2 não é o primário"; exit 1; }

  echo "1/3 postgres vira réplica do postgres-2 (pg_rewind)"
  tornar_replica postgres postgres-2
  esperar_sincronia postgres postgres-2
  echo "2/3 troca planejada: para o postgres-2 e promove o postgres"
  docker compose stop -t 60 postgres-2 >/dev/null 2>&1
  sql postgres 'select pg_promote(true, 60)' >/dev/null
  sql postgres 'alter system reset primary_conninfo' >/dev/null
  sql postgres 'select pg_reload_conf()' >/dev/null
  echo "3/3 postgres-2 volta a ser réplica do postgres"
  tornar_replica postgres-2 postgres
  esperar_sincronia postgres-2 postgres
  echo "Depois:"; mostrar_papeis
  exit 0
fi

echo "Antes:"; mostrar_papeis
[ "$(papel postgres)" = "primário" ] || { echo "ERRO: rode com --restaurar primeiro"; exit 1; }
esperar_sincronia postgres-2 postgres
antes=$(sql postgres 'select count(*) from relatos')
echo "Relatos no banco: $antes"

echo "Derrubando o primário (postgres)..."
docker compose stop -t 60 postgres >/dev/null 2>&1
t0=$(date +%s)
sql postgres-2 'select pg_promote(true, 60)' >/dev/null
echo "Réplica promovida em $(( $(date +%s) - t0 )) s"; mostrar_papeis

aceitos=0
for i in $(seq 1 10); do
  codigo=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$api/v1/relatos" -H 'content-type: application/json' \
    -d "{\"client_id\":\"$(cat /proc/sys/kernel/random/uuid)\",\"device_id\":\"$(cat /proc/sys/kernel/random/uuid)\",\"tipo\":\"calor\",\"severidade\":\"baixo\",\"latitude\":-23.$((5600+i)),\"longitude\":-46.6$((400+i)),\"registrado_em\":\"$(date -u +%FT%TZ)\"}")
  [ "$codigo" = 202 ] && aceitos=$((aceitos + 1)) || echo "[$i] HTTP $codigo"
done
echo "Enviados com o primário fora: $aceitos aceitos"

# Conexões antigas caem como erro transitório: o relato volta pela fila de 60 s
alvo=$((antes + aceitos))
for _ in $(seq 1 150); do
  [ "$(sql postgres-2 'select count(*) from relatos')" -ge "$alvo" ] && break
  sleep 1
done
depois=$(sql postgres-2 'select count(*) from relatos')
echo "Relatos no novo primário (postgres-2): $antes → $depois (perdidos: $(( alvo > depois ? alvo - depois : 0 )))"
echo "Para voltar ao normal: infra/demo/falha-postgres.sh --restaurar"
