# ADR 0002: RabbitMQ como message broker

**Status:** aceito

## Contexto
A proposta aceita RabbitMQ, Kafka ou MQTT. Precisamos de filas persistentes, retries, DLQ e particionamento, num laptop com pouca memória.

## Decisão
RabbitMQ 3.13 em **cluster de 3 nós** (filas *quorum* replicadas, líderes balanceados, HAProxy na frente) com exchange topic `ecopulse.events`, consistent hash exchange para particionar por região, filas de retry com TTL e DLQ.

## Alternativas
- **Kafka:** ótimo para streams de alta vazão, mas pesado (JVM) e sem DLQ nativa. Nosso volume é de ~50 msg/s no pico.
- **MQTT (Mosquitto):** leve, mas sem DLQ e com garantias de persistência mais fracas no broker.

## Consequências
- DLQ, TTL e consistent hash vêm prontos (plugin incluso).
- Se os aparelhos passarem a mandar telemetria contínua, Kafka volta a ser considerado.
