"""Topologia do RabbitMQ e publicação de eventos (ver ADR 0002 e 0004).

publish(relato.recebido)
        │
ecopulse.events (topic) ──"relato.recebido"──► ecopulse.relatos (x-consistent-hash,
        │                                         hash-header=geohash5)
        │ outros consumidores                        │ peso 1 por partição
        ▼ (realtime, cache...)                       ▼
                                          relatos.p0 … relatos.p{N-1}
                                                     │ falha
                ┌────────────────────────────────────┘
                ▼
ecopulse.retry (direct) ─"1000"/"10000"/"60000"─► relatos.retry.<ms> (TTL)
                │ expirou → volta ao ecopulse.relatos e cai na MESMA partição
                ▼ esgotou tentativas / erro permanente
ecopulse.dlx (direct) ──"dead"──► ecopulse.dlq
"""

from dataclasses import dataclass

import aio_pika
from aio_pika.abc import AbstractChannel, AbstractExchange, AbstractRobustConnection, FieldValue

from ecopulse_common.events import Envelope

EVENTS_EXCHANGE = "ecopulse.events"
RELATOS_EXCHANGE = "ecopulse.relatos"
RETRY_EXCHANGE = "ecopulse.retry"
DLX = "ecopulse.dlx"
DLQ = "ecopulse.dlq"
DLQ_ROUTING_KEY = "dead"

PARTITION_HEADER = "geohash5"
ATTEMPT_HEADER = "x-attempt"  # 0 na primeira entrega
ERROR_HEADER = "x-error"
RETRY_DELAYS_MS: tuple[int, ...] = (1_000, 10_000, 60_000)


def partition_queue(index: int) -> str:
    return f"relatos.p{index}"


def retry_queue(delay_ms: int) -> str:
    return f"relatos.retry.{delay_ms}"


@dataclass(frozen=True)
class Topology:
    events: AbstractExchange
    relatos: AbstractExchange
    retry: AbstractExchange
    dlx: AbstractExchange
    partition_queues: tuple[str, ...]


async def connect(url: str) -> AbstractRobustConnection:
    """Conexão robusta (reconecta sozinha)."""
    return await aio_pika.connect_robust(url)


async def declare_topology(channel: AbstractChannel, partitions: int) -> Topology:
    """Declara (de forma idempotente) tudo do diagrama acima. Tudo durável.

    - partições: argumento x-dead-letter-exchange=DLX e x-dead-letter-routing-key=DLQ_ROUTING_KEY
      (rede de segurança para nack sem requeue)
    - filas de retry: x-message-ttl=<ms>, x-dead-letter-exchange=RELATOS_EXCHANGE
    - ecopulse.relatos: tipo "x-consistent-hash", argumento hash-header=PARTITION_HEADER
    """
    events = await channel.declare_exchange(
        EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
    )
    relatos = await channel.declare_exchange(
        RELATOS_EXCHANGE,
        "x-consistent-hash",
        durable=True,
        arguments={"hash-header": PARTITION_HEADER},
    )
    retry = await channel.declare_exchange(
        RETRY_EXCHANGE, aio_pika.ExchangeType.DIRECT, durable=True
    )
    dlx = await channel.declare_exchange(DLX, aio_pika.ExchangeType.DIRECT, durable=True)

    dlq = await channel.declare_queue(DLQ, durable=True)
    await dlq.bind(dlx, routing_key=DLQ_ROUTING_KEY)

    for delay_ms in RETRY_DELAYS_MS:
        queue = await channel.declare_queue(
            retry_queue(delay_ms),
            durable=True,
            arguments={
                "x-message-ttl": delay_ms,
                "x-dead-letter-exchange": RELATOS_EXCHANGE,
            },
        )
        await queue.bind(retry, routing_key=str(delay_ms))

    nomes_particoes: list[str] = []
    for index in range(partitions):
        nome = partition_queue(index)
        queue = await channel.declare_queue(
            nome,
            durable=True,
            arguments={
                "x-dead-letter-exchange": DLX,
                "x-dead-letter-routing-key": DLQ_ROUTING_KEY,
            },
        )
        await queue.bind(relatos, routing_key="1")
        nomes_particoes.append(nome)

    await relatos.bind(events, routing_key="relato.recebido")

    return Topology(
        events=events,
        relatos=relatos,
        retry=retry,
        dlx=dlx,
        partition_queues=tuple(nomes_particoes),
    )


async def publish(
    exchange: AbstractExchange,
    envelope: Envelope,
    *,
    routing_key: str | None = None,
    headers: dict[str, str | int] | None = None,
) -> None:
    """Publica o envelope como JSON persistente.

    routing_key padrão = envelope.type; message_id = event_id; content_type application/json;
    sempre inclui o header PARTITION_HEADER = envelope.geohash[:5].
    Aguarda o publisher confirm (o canal deve ser aberto com publisher_confirms=True, o padrão).
    """
    cabecalhos: dict[str, FieldValue] = {chave: valor for chave, valor in (headers or {}).items()}
    cabecalhos[PARTITION_HEADER] = envelope.geohash[:5]

    message = aio_pika.Message(
        body=envelope.model_dump_json().encode(),
        headers=cabecalhos,
        content_type="application/json",
        message_id=str(envelope.event_id),
        delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
    )
    chave = routing_key if routing_key is not None else str(envelope.type)
    await exchange.publish(message, routing_key=chave)
