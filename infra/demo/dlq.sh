#!/usr/bin/env bash
# Publica uma mensagem que não é JSON e mostra o erro registrado na DLQ.
set -euo pipefail
cd "$(dirname "$0")/.."
[[ -f .env ]] && set -a && . ./.env && set +a

rab(){ docker compose exec -T rabbitmq-1 rabbitmqadmin -u ecopulse -p ecopulse "$@"; }
contar_dlq(){ docker compose exec -T rabbitmq-1 rabbitmqctl list_queues name messages --quiet \
  | awk '$1 == "ecopulse.dlq" {print $2}'; }

antes=$(contar_dlq)
antes=${antes:-0}
echo "Mensagens na DLQ antes: $antes"

rab publish exchange=ecopulse.relatos routing_key=1 \
  payload='isto não é um relato' \
  properties='{"headers":{"geohash5":"6gycf"}}' >/dev/null
echo "Mensagem inválida publicada em ecopulse.relatos (geohash5=6gycf)"

alvo=$((antes + 1))
for _ in $(seq 1 20); do
  depois=$(contar_dlq)
  depois=${depois:-0}
  [ "$depois" -ge "$alvo" ] && break
  sleep 1
done
echo "Mensagens na DLQ depois: $depois"

if [ "$depois" -gt 0 ]; then
  # ack_requeue_true devolve a mensagem à fila: só lemos o header, sem consumir.
  rab get queue=ecopulse.dlq count="$depois" ackmode=ack_requeue_true -f raw_json \
    | python3 -c 'import json, sys; mensagens = json.load(sys.stdin); cabecalhos = mensagens[-1].get("properties", {}).get("headers", {}); print("x-error: " + cabecalhos.get("x-error", "<sem x-error>"))'
fi
