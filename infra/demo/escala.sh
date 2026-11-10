#!/usr/bin/env bash
# Sobe 3 réplicas do processor e mostra a carga dividida entre as regiões.
# Use --manter para deixar as 3 réplicas no ar ao final.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env ]] && set -a && . ./.env && set +a
api="${ECOPULSE_API:-http://localhost:${API_PORT:-8000}}"

manter=false
for arg in "$@"; do
  [ "$arg" = "--manter" ] && manter=true
done

echo "Subindo 3 réplicas do processor..."
docker compose --progress quiet up -d --no-deps --scale processor=3 --no-recreate processor >/dev/null

for _ in $(seq 1 60); do
  n=$(docker compose ps -q processor | wc -l)
  [ "$n" -eq 3 ] && break
  sleep 1
done
if [ "$n" -ne 3 ]; then
  echo "ERRO: esperava 3 containers do processor, há $n"
  exit 1
fi
echo "3 containers do processor no ar"

inicio=$(date -u +%Y-%m-%dT%H:%M:%S.%NZ)
echo "Início da medição: $(date -u +%H:%M:%S) UTC"

# 6 pontos distantes ≥ 10 km entre si, cada um em um geohash5 diferente de SP.
regioes=(
  "-23.45,-46.63"
  "-23.55,-46.63"
  "-23.65,-46.63"
  "-23.55,-46.53"
  "-23.55,-46.73"
  "-23.65,-46.73"
)

aceitos=0
recusados=0
for regiao in "${regioes[@]}"; do
  lat=${regiao%,*}
  lon=${regiao#*,}
  for _ in $(seq 1 10); do
    codigo=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$api/v1/relatos" -H 'content-type: application/json' \
      -d "{\"client_id\":\"$(cat /proc/sys/kernel/random/uuid)\",\"device_id\":\"$(cat /proc/sys/kernel/random/uuid)\",\"tipo\":\"alagamento\",\"severidade\":\"alto\",\"latitude\":$lat,\"longitude\":$lon,\"registrado_em\":\"$(date -u +%FT%TZ)\"}")
    if [ "$codigo" = 202 ]; then
      aceitos=$((aceitos + 1))
    else
      recusados=$((recusados + 1))
      echo "[$lat,$lon] HTTP $codigo"
    fi
    sleep 0.05
  done
  echo "  região $lat,$lon: 10 relatos"
done
echo "Enviados: $aceitos aceitos · $recusados recusados (6 regiões, 10 cada)"

sleep 10

mapfile -t containers < <(docker compose ps -q processor)
if [ "${#containers[@]}" -eq 0 ]; then
  echo "ERRO: nenhum container do processor encontrado"
  exit 1
fi

total=0
echo "Mensagens processadas desde o início da medição:"
for id in "${containers[@]}"; do
  nome=$(docker inspect --format '{{.Name}}' "$id" | sed 's#^/##')
  n=$(docker logs --since "$inicio" "$id" 2>&1 | grep -c 'mensagem processada' || true)
  printf '  %-24s %3d\n' "$nome" "$n"
  total=$((total + n))
done
echo "Total: $total mensagens"

echo "Consumidores por fila:"
docker compose exec -T rabbitmq-1 rabbitmqctl list_queues name consumers --quiet \
  | awk '$1 ~ /^relatos\.p[0-9]+$/'

if [ "$manter" = true ]; then
  echo "Mantendo 3 réplicas (--manter)"
else
  docker compose --progress quiet up -d --no-deps --scale processor=1 --no-recreate processor >/dev/null
  echo "Voltou para 1 réplica do processor"
fi
