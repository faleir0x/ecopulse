#!/usr/bin/env bash
# Para o processor, envia 30 relatos e mostra a fila acumulando; ao religar, nada se perde.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env ]] && set -a && . ./.env && set +a
api="http://localhost:${API_PORT:-8000}"

contar(){ docker compose exec -T postgres psql -U ecopulse -d ecopulse -tAc "select count(*) from relatos"; }
filas(){ docker compose exec -T rabbitmq-1 rabbitmqctl list_queues name messages --quiet \
  | awk '$1 ~ /^relatos\.p[0-9]+$/ {printf "%s%s=%s", (n++ ? " " : ""), $1, $2}'; }
total_filas(){ docker compose exec -T rabbitmq-1 rabbitmqctl list_queues name messages --quiet \
  | awk '$1 ~ /^relatos\.p[0-9]+$/ {soma += $2} END {print soma + 0}'; }

# Se algo falhar no meio, não deixa o processor parado.
trap 'if [ -z "$(docker compose ps --status running -q processor)" ]; then docker compose --progress quiet up -d --no-deps --no-recreate processor >/dev/null 2>&1 || true; fi' EXIT

docker compose --progress quiet stop processor >/dev/null
echo "processor parado"
antes=$(contar)

aceitos=0
recusados=0
for i in $(seq 1 30); do
  codigo=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$api/v1/relatos" -H 'content-type: application/json' \
    -d "{\"client_id\":\"$(cat /proc/sys/kernel/random/uuid)\",\"device_id\":\"$(cat /proc/sys/kernel/random/uuid)\",\"tipo\":\"calor\",\"severidade\":\"baixo\",\"latitude\":-23.$((5500+i)),\"longitude\":-46.6$((300+i)),\"registrado_em\":\"$(date -u +%FT%TZ)\"}")
  if [ "$codigo" = 202 ]; then
    aceitos=$((aceitos + 1))
  else
    recusados=$((recusados + 1))
    echo "[$i] HTTP $codigo"
  fi
  sleep 0.1
done

depois=$(contar)
echo "Enviados: $aceitos aceitos · $recusados recusados"
echo "Filas com o processor parado: $(filas)"
echo "Relatos no banco: $antes → $depois (não mudou)"

docker compose --progress quiet up -d --no-deps --no-recreate processor >/dev/null
echo "processor religado; aguardando gravar os $aceitos relatos..."
alvo=$((antes + aceitos))
for _ in $(seq 1 60); do
  atual=$(contar)
  [ "$atual" -ge "$alvo" ] && break
  sleep 1
done

# O ack acontece depois do COMMIT; espera a fila esvaziar de fato.
for _ in $(seq 1 10); do
  [ "$(total_filas)" -eq 0 ] && break
  sleep 1
done

atual=$(contar)
gravados=$((atual - antes))
perdidos=$((aceitos - gravados))
if [ "$perdidos" -lt 0 ]; then perdidos=0; fi
echo "Filas após religar: $(filas)"
echo "Recebidos: $aceitos · gravados: $gravados · perdidos: $perdidos"
