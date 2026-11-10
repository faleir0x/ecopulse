# Demonstrações do EcoPulse

Roteiros para a apresentação da APS. Rode da raiz do repositório; os scripts carregam `infra/.env` sozinhos e usam a API em `http://localhost:$API_PORT` (ou em `ECOPULSE_API`, se definida — ver `infra/deploy/README.md` para a VPS). A stack precisa estar de pé (`cd infra && docker compose up -d`).

> Os cenários de falha param ou escalam containers: rode um de cada vez.

| Cenário | O que demonstra | Comando | O que observar |
|---|---|---|---|
| Semear dados | Caminho real API → RabbitMQ → processor → PostGIS, criando ocorrências em volta da Av. Paulista | `python3 infra/demo/semear.py --api http://localhost:8001` | `GET /v1/ocorrencias` e mapa populados; `select count(*) from relatos` cresce; logs “mensagem processada” |
| Falha de nó do RabbitMQ | Cluster de 3 nós sobrevive à queda de 1 sem recusar nem perder relatos | `infra/demo/falha-rabbitmq.sh` | `Aceitos: 40 · recusados: 0 · gravados no banco: 40`; o nó derrubado volta ao cluster |
| Falha de mestre do Redis | Réplica assume o lugar do mestre e a API continua respondendo | `infra/demo/falha-redis.sh` | `cluster_state:ok`, mestres trocados e API respondendo durante a falha |
| Falha do PostgreSQL primário | Réplica promovida e relatos continuam sendo gravados; papéis devolvidos sem perda | `infra/demo/falha-postgres.sh` e depois `infra/demo/falha-postgres.sh --restaurar` | `Réplica promovida em ~4 s` e `perdidos: 0`; no `--restaurar`, `postgres: primário · postgres-2: réplica` |
| Relato vira alerta (medido) | Latência real relato → alerta no WebSocket | `ECOPULSE_E2E_API=http://localhost:8001 uv run pytest -m e2e -s` | `latencia relato→alerta: ~0,9 s` |
| Processor parado | A fila acumula e drena sem perder relatos quando o worker volta | `infra/demo/falha-processor.sh` | Filas `relatos.p*` > 0 e banco inalterado com o worker parado; ao religar, filas zeram e `Recebidos: 30 · gravados: 30 · perdidos: 0` |
| DLQ | Mensagem inválida vai direto para a DLQ, com o erro registrado | `infra/demo/dlq.sh` | DLQ +1 e header `x-error` (`ValidationError`) na mensagem, que continua na fila |
| Escala do processor | 3 réplicas consomem as partições por região como consumidores concorrentes e dividem a carga | `infra/demo/escala.sh` (ou `infra/demo/escala.sh --manter`) | 3 containers, divisão de “mensagem processada” entre eles e 3 consumidores por fila; sem `--manter`, volta a 1 réplica |
| Modo avião (manual) | App offline enfileira o relato e sincroniza sem duplicar | passos abaixo | Relato “pendente” no app; ao voltar a rede, o pendente some e a contagem no banco sobe exatamente 1 |

> `semear.py` não lê o `.env`: use a porta `API_PORT` do `infra/.env` (no exemplo, 8001; o padrão do script é 8000).

## Modo avião (manual)

1. Com o app aberto e a rede ligada, anote a contagem atual (comando executado em `infra/`):
   ```bash
   docker compose exec -T postgres psql -U ecopulse -d ecopulse -tAc "select count(*) from relatos"
   ```
2. Ative o **modo avião** no celular.
3. Faça um relato no app. Ele deve aparecer como **pendente** (outbox local).
4. Desative o modo avião e espere o sincronizador.
5. O relato sai de “pendente” e a contagem no banco sobe exatamente 1 (repita o `select count(*)`). Não é preciso conferir `client_id`: a contagem antes/depois basta para mostrar que não duplicou.
