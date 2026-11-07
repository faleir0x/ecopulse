# ADR 0005: Redis Cluster para cache e pub/sub

**Status:** aceito

## Contexto
A proposta pede Redis Cluster para cache e pub/sub, com consistência eventual sincronizada ao PostgreSQL/PostGIS.

## Decisão
Redis Cluster com 3 nós mestres no Compose (sem réplicas, para caber no laptop).
- Cache-aside por célula (`cell:{geohash5}:ocorrencias`, TTL 30 s), invalidado por evento.
- Rate limit por aparelho.
- Pub/sub por célula para o serviço `realtime`.

## Consequências
- Leituras do mapa podem ficar até 30 s desatualizadas se uma invalidação falhar.
- Sem réplicas, a queda de um nó perde um terço do cache; o PostGIS continua sendo a fonte da verdade.
