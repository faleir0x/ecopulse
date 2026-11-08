# Arquitetura do EcoPulse

Arquitetura orientada a eventos (EDA) com microsserviços, conforme a seção III da proposta. As decisões estão registradas em [`docs/adr/`](adr/).

## Requisitos

**Funcionais**
- Relatar ocorrência (alagamento, calor, qualidade do ar, rota obstruída) com GPS automático.
- Mapa com ocorrências e camadas ambientais (AQI, ilhas de calor).
- Alerta quando o usuário está perto de um risco.
- Funcionar offline e sincronizar ao voltar a rede.

**Não funcionais (por prioridade)**
1. Nenhum relato ou alerta é perdido: app offline, worker caído ou broker reiniciando.
2. Absorver picos de carga em eventos climáticos.
3. Alerta em segundos.
4. Leitura do mapa rápida, com consistência eventual.

**Restrições:** equipe pequena, prazo de um semestre, tudo rodando em um laptop com Docker Compose.

## Estimativa de carga

São Paulo em dia de temporal: 1% da população com o app aberto ≈ 120 mil usuários. Se 5% relatarem em uma hora, são ~6 mil relatos/h (média ~2/s, picos ~50/s).

O volume de escrita é pequeno. Os pontos difíceis são **absorver picos** (fila) e o **fan-out** dos alertas para milhares de conexões abertas (WebSocket + pub/sub).

## Componentes

```
 ┌──────────────── App (Expo) ────────────────┐
 │ UI ─ estado ─ repositórios ─ SQLite(outbox) │
 └──────┬──────────────────────────▲───────────┘
   HTTP │ POST relato / GET mapa   │ WebSocket (assina células geohash)
        ▼                          │
 ┌─────────────┐            ┌──────┴───────┐
 │     api     │            │   realtime   │ ×N
 └──┬───────┬──┘            └──────▲───────┘
    │publish│ leitura              │ pub/sub por célula
    ▼       ▼                      │
 ┌────────┐ ┌─────────────────────┴──┐
 │RabbitMQ│ │     Redis Cluster      │
 └───┬────┘ └───────────▲────────────┘
     │ relato.recebido  │ cache / publish
     ▼                  │
 ┌──────────────┐  ┌────┴─────────┐
 │  processor   │─►│ PostgreSQL + │
 │      ×N      │  │   PostGIS    │
 └──────▲───────┘  └──────────────┘
        │ leitura.ambiente
 ┌──────┴───────┐
 │ environment  │ ← Open-Meteo + simulador
 └──────────────┘
```

| Serviço | Responsabilidade | Escala |
|---|---|---|
| `api` | Comandos (publica na fila, responde 202) e leituras (Redis → PostGIS) | Sem estado, N réplicas |
| `processor` | Consome relatos: deduplica, geohash, agrupa em ocorrências, grava, emite eventos via outbox | N réplicas, particionado por região |
| `realtime` | Conexões WebSocket; cada cliente assina as células ao seu redor | N réplicas unidas pelo pub/sub |
| `environment` | Coleta AQI/temperatura por célula; modo simulador para demonstração | 1 instância |

Escrita assíncrona pela fila e leitura síncrona pelo cache/banco: um **CQRS simplificado**.

## Modelo de dados (PostGIS é a fonte da verdade)

- **`relatos`**: cada envio, append-only. `client_id UNIQUE` garante idempotência.
- **`ocorrencias`**: agrupa relatos do mesmo tipo a menos de 300 m nas últimas 2 h (`ST_DWithin`). Guarda severidade, confirmações, status e expiração.
- **`leituras_ambiente`**: AQI e temperatura por célula e horário.
- **`outbox`**: eventos a publicar, gravados na mesma transação da mudança.

## Eventos

Exchange topic `ecopulse.events`. Envelope: `event_id, type, version, occurred_at, geohash, payload`.

| Evento | Produtor | Consumidores |
|---|---|---|
| `relato.recebido` | api | processor |
| `ocorrencia.criada` / `.atualizada` / `.expirada` | processor (outbox) | realtime, invalidação de cache |
| `leitura.ambiente` | environment | processor |

## Confiabilidade de ponta a ponta

1. **App:** relato vai para a outbox no SQLite com `client_id` (UUID); o sincronizador reenvia com backoff exponencial e só apaga após o 202.
2. **API:** publisher confirms; responde 202 só depois que o broker persistiu.
3. **Processor:** ack manual após o `COMMIT`; se cair, a mensagem volta para a fila.
4. **Retry:** filas de espera com TTL (1 s → 10 s → 60 s); após 3 falhas, DLQ. Mensagem inválida vai direto para a DLQ.
5. **Idempotência:** `ON CONFLICT (client_id) DO NOTHING`. Entrega at-least-once, efeito exactly-once.
6. **Outbox:** evita "gravou no banco mas caiu antes de publicar".

## Particionamento geoespacial

- **GeoHash** precisão 6 (~1,2 × 0,6 km): células de ocorrência e de assinatura de alertas.
- **GeoHash** precisão 5 (~5 km): chave de partição no *consistent hash exchange*, que distribui as regiões entre N filas-partição (uma região sempre cai na mesma fila, inclusive nos retries). Os workers consomem as partições como consumidores concorrentes; a corrida entre dois relatos da mesma célula é resolvida no banco com lock por célula.
- No Redis Cluster, as chaves por célula (`cell:{geohash5}:...`) se espalham pelos slots dos 3 nós: sharding horizontal do cache por região.
- O app assina sua célula e as 8 vizinhas; a distância exata é conferida no app.

## Cache e consistência

- Redis Cluster: chave `cell:{geohash5}:ocorrencias` com TTL de 30 s (cache-aside), invalidada por `ocorrencia.atualizada`.
- Rate limit por aparelho (token bucket).
- Pub/sub por célula para o `realtime` (detalhes abaixo).

## Tempo real

```
ocorrencia.* ─► fila realtime.ponte (compartilhada) ─► SPUBLISH ocorrencias:{geohash6}
                                                         │ Redis Cluster (sharded pub/sub:
                                                         │ cada canal vive no nó do seu slot)
                       realtime #1 ◄── SSUBSCRIBE ───────┤
                       realtime #2 ◄── SSUBSCRIBE ───────┘  só das células dos seus clientes
```

- **Ponte:** uma fila durável compartilhada entre as instâncias; cada evento vai ao Redis uma única vez, por qualquer instância.
- **Assinaturas:** cada instância conta referências por célula e só fica inscrita enquanto algum cliente dela quer a célula. Adicionar instâncias não multiplica o tráfego no broker.
- **Backpressure:** cada conexão tem uma fila de saída de 100 mensagens; cliente lento é desconectado (código 1013) em vez de atrasar os outros. O app reconecta e recarrega pelo `GET`.
- Medido no compose: relato → alerta no WebSocket em ~0,7 s (o relay da outbox verifica a cada 0,5 s).

## API

```
POST /v1/relatos                         → 202 {client_id}
GET  /v1/ocorrencias?bbox=&tipo=
GET  /v1/ocorrencias/{id}
POST /v1/ocorrencias/{id}/confirmacoes   → 202
GET  /v1/ambiente?bbox=
WS   /v1/ws   cliente: {"op":"subscribe","cells":[...]}
              servidor: {"type":"ocorrencia.atualizada", ...}
```

Identificação anônima por aparelho (UUID gerado na instalação).

## Observabilidade

- Logs JSON com id de correlação (`client_id` / `event_id`) da API ao WebSocket.
- `/health` e `/ready` em todos os serviços.
- Painel do RabbitMQ para filas, DLQ e vazão.

## Alta disponibilidade

```
serviços ──► HAProxy :5672 ──► rabbitmq-1 ┐
                           ──► rabbitmq-2 ├─ cluster, filas quorum (Raft) com 3 réplicas,
                           ──► rabbitmq-3 ┘  líderes balanceados entre os nós
Redis Cluster: redis-1..3 mestres + redis-4..6 réplicas (uma por mestre), node timeout 5 s
```

- **RabbitMQ:** 3 nós com `pause_minority`; toda fila durável compartilhada é *quorum*. A queda de 1 nó não perde mensagens nem recusa relatos; o HAProxy tira o nó morto e a reconexão robusta do aio-pika cai num nó vivo.
- **Redis:** a réplica de um mestre derrubado é promovida em ~7 s; o cliente do cluster segue o novo mapa de slots.
- **PostgreSQL:** um nó (failover automático exige Patroni/etcd, pesado para o laptop). É a fonte da verdade com volume persistente; fica como evolução.
- Medido no compose: 40 relatos com um nó RabbitMQ derrubado no meio → 40 aceitos, 40 gravados; mestre Redis derrubado → réplica assume em 7,6 s com a API respondendo (`infra/demo/falha-*.sh`).

## Cenários de demonstração

1. Relato em um celular, alerta no outro em segundos.
2. Worker derrubado: fila acumula; ao religar, tudo é processado sem perda.
3. Mensagem inválida termina na DLQ.
4. `docker compose up --scale processor=3`: carga dividida por região.
5. Modo avião: relato pendente, sincroniza sem duplicar ao voltar a rede.

## O que revisar se o sistema crescer

Kafka para telemetria contínua dos aparelhos; H3 no lugar de GeoHash; PostgreSQL com réplica e failover (Patroni); push remoto via FCM/APNs; autenticação.
