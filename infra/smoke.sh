#!/usr/bin/env bash
# Verifica se a infraestrutura do compose está de pé e integrada.
set -euo pipefail
cd "$(dirname "$0")"
[[ -f .env ]] && set -a && . ./.env && set +a
api="http://localhost:${API_PORT:-8000}"

echo "-> Redis Cluster (3 mestres + 3 réplicas)"
docker compose exec -T redis-1 redis-cli -p 7001 cluster info | grep >/dev/null -- 'cluster_state:ok'
replicas=$(docker compose exec -T redis-1 redis-cli -p 7001 cluster nodes | grep -c slave || true)
[[ "$replicas" -eq 3 ]] || { echo "esperava 3 réplicas, há $replicas"; exit 1; }

echo "-> Cluster RabbitMQ (3 nós)"
nos=$(docker compose exec -T rabbitmq-1 rabbitmqctl cluster_status --formatter json \
  | python3 -c "import json,sys; print(len(json.load(sys.stdin)['running_nodes']))")
[[ "$nos" -eq 3 ]] || { echo "esperava 3 nós RabbitMQ, há $nos"; exit 1; }

echo "-> PostGIS e tabela relatos"
docker compose exec -T postgres psql -U ecopulse -d ecopulse -tAc \
  "select postgis_version() is not null and to_regclass('relatos') is not null" | grep >/dev/null -- t

echo "-> Plugin consistent hash no RabbitMQ"
docker compose exec -T rabbitmq-1 rabbitmq-plugins list -e -m | grep >/dev/null -- rabbitmq_consistent_hash_exchange

echo "-> API"
curl -fsS "$api/health" | grep >/dev/null -- ok
curl -fsS -X POST "$api/v1/relatos" -H "content-type: application/json" \
  -d "{\"client_id\":\"$(cat /proc/sys/kernel/random/uuid)\",\"device_id\":\"$(cat /proc/sys/kernel/random/uuid)\",
       \"tipo\":\"alagamento\",\"severidade\":\"alto\",\"latitude\":-23.55,\"longitude\":-46.63,
       \"registrado_em\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}" \
  | grep >/dev/null -- aceito

echo "Tudo certo."
