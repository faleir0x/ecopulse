# ADR 0009: PostgreSQL com réplica por streaming e failover manual

**Status:** aceito (substitui o "um nó só" da arquitetura inicial)

## Contexto
A proposta pede alta disponibilidade e tolerância a falhas. RabbitMQ (3 nós, filas quorum) e Redis Cluster (réplica por mestre) já resistem à queda de um nó; o PostgreSQL, fonte da verdade, era um nó só. Failover automático de verdade (Patroni + etcd) pesa demais para o laptop da demonstração.

## Decisão
- `postgres` (primário) + `postgres-2` (hot standby por streaming). A réplica se clona com `pg_basebackup` na primeira subida, com o usuário `replicador` (migração 0003).
- Os serviços usam DSN com os dois nós e `target_session_attrs=read-write`: o asyncpg só conecta no nó que aceita escrita, então, promovida a réplica, as conexões novas vão para ela sem reconfigurar nada.
- Failover **manual** (`pg_promote`), demonstrado por `infra/demo/falha-postgres.sh`. Relatos aceitos durante a troca não se perdem: a conexão caída é erro transitório e o relato volta pela fila de espera (ADR 0004).
- `wal_log_hints=on` e `wal_keep_size` permitem devolver os papéis com `pg_rewind` (`--restaurar`), sem perder o que foi gravado durante a falha.

## Alternativas
- **Patroni/etcd ou repmgr:** failover automático, mas 3+ containers a mais e mais memória.
- **Só backup:** não mantém o sistema escrevendo durante a falha.

## Consequências
- A promoção depende de alguém (ou do script); a janela sem escrita dura o tempo de perceber e promover (~4 s no script). Os relatos esperam na fila nesse meio tempo.
- Replicação assíncrona: o que o primário confirmou e ainda não enviou à réplica pode se perder numa queda brusca. Na demo a parada é limpa.
