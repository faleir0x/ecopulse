# ADR 0005: Redis Cluster para cache e pub/sub

**Status:** aceito

## Contexto
A proposta pede Redis Cluster para cache e pub/sub, com consistência eventual sincronizada ao PostgreSQL/PostGIS.

## Decisão
Redis Cluster com 3 mestres e 3 réplicas no Compose (failover automático em ~7 s, `cluster-node-timeout` 5 s).
- Cache-aside por célula (`cell:{geohash5}:ocorrencias`, TTL 30 s), invalidado por evento.
- Rate limit por aparelho.
- Pub/sub por célula para o serviço `realtime`.

## Consequências
- Leituras do mapa podem ficar até 30 s desatualizadas se uma invalidação falhar.
- A queda de um mestre é coberta pela réplica; o PostGIS continua sendo a fonte da verdade.
