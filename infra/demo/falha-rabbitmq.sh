#!/usr/bin/env bash
# Envia 40 relatos e derruba um nó do RabbitMQ no meio: nenhum pode ser recusado nem perdido.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env ]] && set -a && . ./.env && set +a
api="${ECOPULSE_API:-http://localhost:${API_PORT:-8000}}"
contar(){ docker compose exec -T postgres psql -U ecopulse -d ecopulse -tAc "select count(*) from relatos"; }
antes=$(contar); aceitos=0; recusados=0
for i in $(seq 1 40); do
  if [ "$i" -eq 10 ]; then docker compose kill rabbitmq-2 >/dev/null 2>&1; echo "[$i] rabbitmq-2 derrubado"; fi
  codigo=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$api/v1/relatos" -H 'content-type: application/json' \
    -d "{\"client_id\":\"$(cat /proc/sys/kernel/random/uuid)\",\"device_id\":\"$(cat /proc/sys/kernel/random/uuid)\",\"tipo\":\"calor\",\"severidade\":\"baixo\",\"latitude\":-23.$((5500+i)),\"longitude\":-46.6$((300+i)),\"registrado_em\":\"$(date -u +%FT%TZ)\"}")
  if [ "$codigo" = 202 ]; then aceitos=$((aceitos+1)); else recusados=$((recusados+1)); echo "[$i] HTTP $codigo"; fi
  sleep 0.25
done
sleep 8
echo "Aceitos: $aceitos · recusados: $recusados · gravados no banco: $(( $(contar) - antes ))"
docker compose exec -T rabbitmq-1 rabbitmqctl cluster_status --formatter json \
  | python3 -c "import json,sys; print('Nós rodando:', [n.replace('rabbit@','') for n in json.load(sys.stdin)['running_nodes']])"
docker compose start rabbitmq-2 >/dev/null 2>&1 && echo "rabbitmq-2 religado (volta ao cluster sozinho)"
