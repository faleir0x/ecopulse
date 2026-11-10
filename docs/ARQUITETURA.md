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
        │ leitura.ambiente · telemetria.aparelho (via api)
 ┌──────┴───────┐       ┌──────────────┐
 │ environment  │       │   notifier   │ ← ocorrencia.* → FCM (app fechado)
 └──────────────┘       └──────────────┘
   ↑ Open-Meteo + simulador
```

| Serviço | Responsabilidade | Escala |
|---|---|---|
| `api` | Comandos (publica na fila, responde 202) e leituras (Redis → PostGIS) | Sem estado, N réplicas |
| `processor` | Consome relatos: deduplica, geohash, agrupa em ocorrências, grava, emite eventos via outbox; grava leituras ambientais; conta a presença de aparelhos por célula (telemetria) | N réplicas, particionado por região |
| `realtime` | Conexões WebSocket; cada cliente assina as células ao seu redor | N réplicas unidas pelo pub/sub |
| `environment` | Coleta AQI, tempo e inversão térmica por célula; modo simulador para demonstração | 1 instância |
| `notifier` | Push remoto (FCM) para os aparelhos cujo raio alcança a ocorrência, com o app fechado | N réplicas (fila quorum compartilhada) |

Escrita assíncrona pela fila e leitura síncrona pelo cache/banco: um **CQRS simplificado**.

## Modelo de dados (PostGIS é a fonte da verdade)

- **`relatos`**: cada envio, append-only. `client_id UNIQUE` garante idempotência.
- **`ocorrencias`**: agrupa relatos do mesmo tipo a menos de 300 m de uma ocorrência ativa (`ST_DWithin`); a validade depende do tipo (2 a 6 h, renovada a cada confirmação). Guarda severidade, confirmações, status, expiração e `versao` (incrementada a cada alteração, ver "Ordem dos eventos").
- **`leituras_ambiente`**: AQI e temperatura por célula e horário.
- **`outbox`**: eventos a publicar, gravados na mesma transação da mudança.
- **`aparelhos`**: token FCM, posição arredondada (~100 m), raio, limiar e tipos de cada aparelho com push; some após 7 dias sem renovação.
- **Esquema versionado:** migrações em `infra/postgres/migracoes/NNNN_*.sql`, aplicadas em ordem pelo serviço `migrate` a cada subida e registradas em `schema_migrations` (o initdb só rodaria com volume vazio).

## Eventos

Exchange topic `ecopulse.events`. Envelope: `event_id, type, version, occurred_at, geohash, payload`.

| Evento | Produtor | Consumidores |
|---|---|---|
| `relato.recebido` | api | processor |
| `resolucao.recebida` | api | processor |
| `ocorrencia.criada` / `.atualizada` / `.expirada` | processor (outbox) | realtime, notifier (criada/atualizada), invalidação de cache |
| `leitura.ambiente` | environment | processor |
| `telemetria.aparelho` | api (só a célula geohash6) | processor (presença por célula) |

## Confiabilidade de ponta a ponta

1. **App:** relato vai para a outbox no SQLite com `client_id` (UUID); o sincronizador reenvia com backoff exponencial e só apaga após o 202.
2. **API:** publisher confirms; responde 202 só depois que o broker persistiu.
3. **Processor:** ack manual após o `COMMIT`; se cair, a mensagem volta para a fila.
4. **Retry dos relatos:** filas de espera com TTL (1 s → 10 s → 60 s); após 3 falhas, DLQ. Mensagem inválida vai direto para a DLQ. **Infraestrutura fora do ar** (banco, Redis, rede) é erro transitório: volta para a espera de 60 s sem gastar tentativa, então uma queda do banco não manda para a DLQ relatos já aceitos.
   **Demais consumidores** (ponte do realtime, notifier, invalidação de cache, leituras, telemetria) usam `ecopulse_common.consumer.assinar`: transitório → backoff de até 30 s e nova entrega, sem limite; outro erro → até 3 entregas (`x-delivery-count`) e DLQ com o erro em `x-error`; payload inválido → DLQ direto.
5. **Idempotência:** `ON CONFLICT (client_id) DO NOTHING`. Entrega at-least-once, efeito exactly-once.
6. **Outbox:** evita "gravou no banco mas caiu antes de publicar".

## Particionamento geoespacial

- **GeoHash** precisão 6 (~1,2 × 0,6 km): células de ocorrência e de assinatura de alertas.
- **GeoHash** precisão 5 (~5 km): chave de partição no *consistent hash exchange*, que distribui as regiões entre N filas-partição (uma região sempre cai na mesma fila, inclusive nos retries). Os workers consomem as partições como consumidores concorrentes; a corrida entre relatos próximos é resolvida no banco com locks por célula: o processor trava, em ordem, **todas** as células geohash5 que o raio de agrupamento toca, então dois relatos de lados opostos de uma borda não criam duas ocorrências.
- No Redis Cluster, as chaves por célula (`cell:{geohash5}:...`) se espalham pelos slots dos 3 nós: sharding horizontal do cache por região.
- O app assina as células geohash6 que cobrem o seu raio de alerta (até 50, o limite do servidor); a distância exata é conferida no app.

## Cache e consistência

- Redis Cluster: chave `cell:{geohash5}:ocorrencias` com TTL de 30 s (cache-aside), invalidada por qualquer `ocorrencia.*`.
- Rate limit (token bucket no Redis) por aparelho e por IP, com baldes próprios para votos ("Ainda está"/"Já passou"), consultas de ambiente, rotas, busca de locais, registro de aparelho e telemetria. IPv6 conta pela rede /64.
- Presença de aparelhos: sorted set por célula geohash6 (`presenca:{geohash6}`), janela de 15 min.
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
- A leitura do pub/sub é não bloqueante em todos os nós do cluster (com timeout, o redis-py esperava o tempo inteiro em cada nó vazio antes do próximo).
- Medido pelo teste `tests/e2e` (roda no CI): relato → alerta no WebSocket em ~0,9 s no compose de um laptop carregado (o relay da outbox verifica a cada 0,5 s).
- **Ordem dos eventos:** réplicas do relay publicam em paralelo e os consumidores processam várias mensagens ao mesmo tempo, então eventos da mesma ocorrência podem chegar fora de ordem. Cada ocorrência tem `versao` (incrementada sob o lock da linha); a ponte e o notifier guardam no Redis a maior versão vista (script Lua atômico) e descartam a mais antiga. Um `atualizada` atrasado não ressuscita mais uma ocorrência encerrada.
- **Push remoto:** com o app fechado, o `notifier` avisa pelo FCM os aparelhos registrados cujo raio alcança a ocorrência; `SET NX` por ocorrência, severidade e aparelho evita repetir ([ADR 0007](adr/0007-notificacoes.md)).

## API

```
POST /v1/relatos                         → 202 {client_id}
GET  /v1/ocorrencias?bbox=&tipo=
GET  /v1/ocorrencias/{id}
GET  /v1/relatos/{client_id}             (situação do próprio relato)
POST /v1/ocorrencias/{id}/confirmacoes   → 202
POST /v1/ocorrencias/{id}/resolucoes     → 202
PUT  /v1/aparelhos/{id}                  → 204 (token FCM, posição, raio, limiar, tipos)
DELETE /v1/aparelhos/{id}                → 204
GET  /v1/ambiente?lat=&lon=
GET  /v1/ambiente/camada?bbox=
GET  /v1/locais?q=&perto=
GET  /v1/rotas?origem=&destino=&modo=
POST /v1/telemetria                      → 202 (posição; só a célula geohash6 segue adiante)
GET  /v1/presenca?lat=&lon=              → {aparelhos, janela_min}
WS   /v1/ws   cliente: {"op":"subscribe","cells":[...]}
              servidor: {"type":"ocorrencia.atualizada", ...}
```

Identificação anônima por aparelho (UUID gerado na instalação).

## Roteamento preventivo
`GET /v1/rotas?origem=lat,lon&destino=lat,lon&modo=pedestre|carro` busca as ocorrências ativas no retângulo da viagem (+1 km), transforma as moderadas ou piores em círculos com o raio da zona de influência (300/500/800 m, os mesmos do alerta e do mapa; `ecopulse_common.zonas`) e pede ao OpenRouteService a rota com `avoid_polygons` e a direta, em paralelo. A resposta traz a rota segura, a direta e as ocorrências evitadas. Cache de 5 min no Redis Cluster; chave do ORS só no servidor ([ADR 0008](adr/0008-roteamento-ors.md)).

`GET /v1/locais?q=&perto=lat,lon` usa a geocodificação do mesmo ORS para quem está sem GPS escolher um bairro ou endereço (só Brasil, bairros antes de estabelecimentos, priorizando a região de `perto`); cache de 1 dia no Redis.

## Celular como nó sensor (telemetria)

O app manda `POST /v1/telemetria` a cada 5 min em primeiro plano (ou ao andar 300 m), só com posição real. A API reduz a posição à célula geohash6 (~1,2 × 0,6 km) e publica `telemetria.aparelho`: a coordenada exata não vai para o broker, para o banco nem para o log. O processor mantém, por célula, os aparelhos com sinal nos últimos 15 min no Redis Cluster; `GET /v1/presenca` soma a célula e as 8 vizinhas, e a aba Agora mostra quantas pessoas com o EcoPulse estão por perto.

## Inversão térmica

O `environment` pede à Open-Meteo a temperatura e a altura geopotencial em 925 e 850 hPa e compara a temperatura a 2 m com a do primeiro nível que esteja ao menos 100 m acima do terreno. Ar mais quente em cima é inversão: a poluição fica presa perto do chão. A leitura ambiental traz `inversao_termica` e `inversao_delta_c`, e a aba Agora mostra um cartão quando há inversão.

## Observabilidade

- Logs JSON com id de correlação (`client_id` / `event_id`) da API ao WebSocket.
- `/health` e `/ready` na `api` e no `realtime` (os serviços HTTP); processor, environment e notifier não expõem porta, e o compose acompanha só se o processo está de pé.
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
- **PostgreSQL:** primário + réplica (`postgres-2`) por streaming, em hot standby. Os serviços usam DSN com os dois nós e `target_session_attrs=read-write`: depois de promover a réplica, as conexões novas vão para ela sozinhas. O failover é **manual** (`pg_promote`), porque o automático exige Patroni/etcd, pesado para o laptop; `wal_log_hints` permite devolver os papéis com `pg_rewind` sem perder o que foi gravado durante a falha.
- Banco, broker e cache publicam portas só no `127.0.0.1` do laptop; na rede ficam só a API e o realtime.
- Medido no compose: 40 relatos com um nó RabbitMQ derrubado no meio → 40 aceitos, 40 gravados; mestre Redis derrubado → réplica assume em 7,6 s com a API respondendo; PostgreSQL primário derrubado → réplica promovida em 4 s, 10 relatos com o primário fora e 0 perdidos (`infra/demo/falha-*.sh`).

## Cenários de demonstração

Roteiro completo, comandos e o que observar em [`infra/demo/README.md`](../infra/demo/README.md).

1. Relato em um celular, alerta no outro em segundos.
2. Worker derrubado: fila acumula; ao religar, tudo é processado sem perda — [`infra/demo/falha-processor.sh`](../infra/demo/falha-processor.sh).
3. Mensagem inválida termina na DLQ — [`infra/demo/dlq.sh`](../infra/demo/dlq.sh).
4. `docker compose up --scale processor=3`: as réplicas consomem as partições por região como consumidores concorrentes e dividem a carga — [`infra/demo/escala.sh`](../infra/demo/escala.sh).
5. PostgreSQL primário derrubado: réplica promovida, relatos continuam sendo gravados, papéis devolvidos sem perda — [`infra/demo/falha-postgres.sh`](../infra/demo/falha-postgres.sh).
6. Modo avião: relato pendente, sincroniza sem duplicar ao voltar a rede — passos no [`README`](../infra/demo/README.md#modo-avião-manual).

## O que revisar se o sistema crescer

Kafka se a telemetria dos aparelhos virar fluxo contínuo de sensores (hoje é um sinal de presença a cada 5 min); H3 no lugar de GeoHash; failover automático do PostgreSQL (Patroni); APNs para iOS.
