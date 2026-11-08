#!/bin/sh
# Cria o Redis Cluster uma única vez: 3 mestres + 3 réplicas (uma réplica por mestre).
# Se um mestre cair, a réplica dele é promovida automaticamente.
set -eu
for n in 1 2 3 4 5 6; do
  until redis-cli -h "redis-$n" -p "700$n" ping >/dev/null 2>&1; do sleep 1; done
done
if redis-cli -h redis-1 -p 7001 cluster info | grep -q 'cluster_state:ok'; then
  echo "cluster já existe"
  exit 0
fi

redis-cli --cluster create \
  10.89.70.11:7001 10.89.70.12:7002 10.89.70.13:7003 \
  10.89.70.14:7004 10.89.70.15:7005 10.89.70.16:7006 \
  --cluster-replicas 1 --cluster-yes
