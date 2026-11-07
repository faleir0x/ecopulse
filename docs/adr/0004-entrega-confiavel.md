# ADR 0004: Entrega at-least-once com idempotência e transactional outbox

**Status:** aceito

## Contexto
Nenhum alerta crítico pode ser perdido (proposta, seção III). Falhas podem acontecer no app, na API, no broker e no worker.

## Decisão
- App: outbox local no SQLite com `client_id` (UUID).
- API: publisher confirms; 202 só após persistência no broker.
- Processor: ack manual após o commit; retries com backoff (1 s, 10 s, 60 s); depois DLQ.
- Banco: `ON CONFLICT (client_id) DO NOTHING`.
- Eventos de saída gravados na tabela `outbox` na mesma transação e publicados por um relay.

## Consequências
- Mensagens podem chegar duplicadas; todo consumidor precisa ser idempotente.
- O relay acrescenta latência de até ~1 s aos eventos de saída.
