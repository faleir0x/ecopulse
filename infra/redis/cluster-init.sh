#!/bin/sh
# Cria o Redis Cluster (3 mestres, sem réplicas) uma única vez.
set -eu
until redis-cli -h redis-1 -p 7001 ping >/dev/null 2>&1 \
   && redis-cli -h redis-2 -p 7002 ping >/dev/null 2>&1 \
   && redis-cli -h redis-3 -p 7003 ping >/dev/null 2>&1; do
  sleep 1
done
if redis-cli -h redis-1 -p 7001 cluster info | grep -q 'cluster_state:ok'; then
  echo "cluster já existe"
  exit 0
fi

redis-cli --cluster create \
  10.89.70.11:7001 10.89.70.12:7002 10.89.70.13:7003 \
  --cluster-replicas 0 --cluster-yes
