#!/usr/bin/env bash
# Derruba um MESTRE do Redis Cluster e mede quanto tempo até a réplica assumir.
cd "$(dirname "$0")/.."
[[ -f .env ]] && set -a && . ./.env && set +a
api="${ECOPULSE_API:-http://localhost:${API_PORT:-8000}}"
mestres(){ docker compose exec -T redis-3 redis-cli -p 7003 cluster nodes | grep master | grep -v fail | grep -o 'redis-[0-9]' | sort; }
alvo=$(mestres | grep -v redis-3 | head -1)
echo "Mestres antes: $(mestres | tr '\n' ' ') → derrubando $alvo"
docker compose kill "$alvo" >/dev/null 2>&1
t0=$(date +%s.%N)
for i in $(seq 1 60); do
  sleep 0.5
  n=$(mestres | wc -l)
  estado=$(docker compose exec -T redis-3 redis-cli -p 7003 cluster info | tr -d '\r' | grep cluster_state)
  [ "$estado" = "cluster_state:ok" ] && [ "$n" -eq 3 ] && ! mestres | grep -qx "$alvo" && break
done
printf "Mestres depois de %.1f s: %s\n" "$(echo "$(date +%s.%N) - $t0" | python3 -c 'print(eval(input()))')" "$(mestres | tr '\n' ' ')"
curl -s -o /dev/null -w "API durante a falha: HTTP %{http_code}\n" "$api/v1/ocorrencias?bbox=-46.68,-23.58,-46.63,-23.54"
docker compose start "$alvo" >/dev/null 2>&1 && echo "$alvo religado (volta como réplica)"
