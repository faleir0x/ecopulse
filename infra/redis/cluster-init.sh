#!/bin/sh
# Forma o Redis Cluster (3 mestres + 3 réplicas, uma por mestre) e mantém os nós se
# encontrando. Roda a cada subida da stack e é idempotente:
# - cluster ainda não existe → cria;
# - cluster já existe → reapresenta cada nó aos outros pelo IP ATUAL (CLUSTER MEET). No compose
#   os IPs são fixos e isso não muda nada; no Docker Swarm cada reinício troca o IP dos nós, e sem
#   o MEET um reinício geral deixaria cada nó procurando os outros nos IPs antigos.
# Os nós se anunciam pelo hostname para os clientes (cluster-announce-hostname).
set -eu

NOS="redis-1:7001 redis-2:7002 redis-3:7003 redis-4:7004 redis-5:7005 redis-6:7006"

ip_de() { getent hosts "$1" | awk '{print $1; exit}'; }

for no in $NOS; do
  host=${no%:*}
  porta=${no#*:}
  until [ -n "$(ip_de "$host")" ] && redis-cli -h "$host" -p "$porta" ping >/dev/null 2>&1; do
    echo "esperando $host"
    sleep 1
  done
done

enderecos=""
for no in $NOS; do
  enderecos="$enderecos $(ip_de "${no%:*}"):${no#*:}"
done

# Algum nó já tem slots atribuídos? Então o cluster existe (mesmo que esteja se recuperando)
existe=false
for no in $NOS; do
  if redis-cli -h "${no%:*}" -p "${no#*:}" cluster info | grep -q '^cluster_slots_assigned:16384'; then
    existe=true
    break
  fi
done

if [ "$existe" = false ]; then
  echo "criando o cluster:$enderecos"
  # shellcheck disable=SC2086
  redis-cli --cluster create $enderecos --cluster-replicas 1 --cluster-yes
  exit 0
fi

reapresentar() {
  enderecos=""
  for no in $NOS; do
    ip=$(ip_de "${no%:*}")
    [ -n "$ip" ] && enderecos="$enderecos $ip:${no#*:}"
  done
  for origem in $NOS; do
    for destino in $enderecos; do
      redis-cli -h "${origem%:*}" -p "${origem#*:}" cluster meet "${destino%:*}" "${destino#*:}" \
        >/dev/null 2>&1 || true
    done
  done
}

cluster_ok() { redis-cli -h redis-1 -p 7001 cluster info 2>/dev/null | grep -q '^cluster_state:ok'; }

echo "cluster já existe; reapresentando os nós pelos IPs atuais"
reapresentar
for _ in $(seq 1 60); do
  cluster_ok && break
  sleep 1
done
if cluster_ok; then echo "cluster ok"; else echo "cluster ainda não está ok" >&2; fi

cluster_ok
