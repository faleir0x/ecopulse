#!/usr/bin/env bash
# Verifica se a infraestrutura do compose está de pé e integrada.
set -euo pipefail
cd "$(dirname "$0")"
[[ -f .env ]] && set -a && . ./.env && set +a
api="http://localhost:${API_PORT:-8000}"

echo "-> Redis Cluster"
docker compose exec -T redis-1 redis-cli -p 7001 cluster info | grep >/dev/null -- 'cluster_state:ok'

echo "-> PostGIS e tabela relatos"
docker compose exec -T postgres psql -U ecopulse -d ecopulse -tAc \
  "select postgis_version() is not null and to_regclass('relatos') is not null" | grep >/dev/null -- t

echo "-> Plugin consistent hash no RabbitMQ"
docker compose exec -T rabbitmq rabbitmq-plugins list -e -m | grep >/dev/null -- rabbitmq_consistent_hash_exchange

echo "-> API"
curl -fsS "$api/health" | grep >/dev/null -- ok
curl -fsS -X POST "$api/relatos" -H 'content-type: application/json' \
  -d "{\"client_id\":\"$(cat /proc/sys/kernel/random/uuid)\",\"latitude\":-23.55,\"longitude\":-46.63}" \
  | grep >/dev/null -- aceito

echo "Tudo certo."
