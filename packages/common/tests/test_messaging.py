from typing import Any, cast

import aio_pika
from aio_pika.abc import AbstractChannel, AbstractExchange

from ecopulse_common.events import Envelope, EventType
from ecopulse_common.messaging import (
    DLQ,
    DLQ_ROUTING_KEY,
    DLX,
    EVENTS_EXCHANGE,
    PARTITION_HEADER,
    QUORUM,
    RELATOS_EXCHANGE,
    RETRY_DELAYS_MS,
    RETRY_EXCHANGE,
    declare_topology,
    partition_queue,
    publish,
    retry_queue,
)

TIPO_EVENTO = EventType.RELATO_RECEBIDO


class FakeExchange:
    def __init__(self, name: str) -> None:
        self.name = name
        self.bind_calls: list[tuple[str, str]] = []
        self.published: list[tuple[aio_pika.Message, str]] = []

    async def bind(self, exchange: Any, routing_key: str = "", **_: Any) -> None:
        self.bind_calls.append((getattr(exchange, "name", str(exchange)), routing_key))

    async def publish(self, message: aio_pika.Message, routing_key: str, **_: Any) -> None:
        self.published.append((message, routing_key))


class FakeQueue:
    def __init__(self, name: str) -> None:
        self.name = name
        self.bind_calls: list[tuple[str, str]] = []

    async def bind(self, exchange: Any, routing_key: str = "", **_: Any) -> None:
        self.bind_calls.append((getattr(exchange, "name", str(exchange)), routing_key))


class FakeChannel:
    def __init__(self) -> None:
        self.exchanges: dict[str, FakeExchange] = {}
        self.queues: dict[str, FakeQueue] = {}
        self.exchange_calls: list[tuple[str, str, bool, dict[str, Any] | None]] = []
        self.queue_calls: list[tuple[str, bool, dict[str, Any] | None]] = []

    async def declare_exchange(
        self,
        name: str,
        exchange_type: Any = aio_pika.ExchangeType.DIRECT,
        *,
        durable: bool = False,
        arguments: dict[str, Any] | None = None,
        **_: Any,
    ) -> FakeExchange:
        tipo = getattr(exchange_type, "value", exchange_type)
        self.exchange_calls.append((name, str(tipo), durable, arguments))
        exchange = FakeExchange(name)
        self.exchanges[name] = exchange
        return exchange

    async def declare_queue(
        self,
        name: str,
        *,
        durable: bool = False,
        arguments: dict[str, Any] | None = None,
        **_: Any,
    ) -> FakeQueue:
        self.queue_calls.append((name, durable, arguments))
        queue = FakeQueue(name)
        self.queues[name] = queue
        return queue


async def test_declare_topology_declara_exchanges() -> None:
    channel = FakeChannel()

    topologia = await declare_topology(cast(AbstractChannel, channel), 3)

    exchanges = {
        nome: (tipo, duravel, args) for nome, tipo, duravel, args in channel.exchange_calls
    }
    assert exchanges[EVENTS_EXCHANGE] == ("topic", True, None)
    assert exchanges[RELATOS_EXCHANGE] == (
        "x-consistent-hash",
        True,
        {"hash-header": PARTITION_HEADER},
    )
    assert exchanges[RETRY_EXCHANGE] == ("direct", True, None)
    assert exchanges[DLX] == ("direct", True, None)
    assert topologia.events.name == EVENTS_EXCHANGE
    assert topologia.relatos.name == RELATOS_EXCHANGE
    assert topologia.retry.name == RETRY_EXCHANGE
    assert topologia.dlx.name == DLX


async def test_declare_topology_liga_eventos_a_relatos() -> None:
    channel = FakeChannel()

    await declare_topology(cast(AbstractChannel, channel), 3)

    assert (EVENTS_EXCHANGE, "relato.recebido") in channel.exchanges[RELATOS_EXCHANGE].bind_calls


async def test_declare_topology_declara_dlq() -> None:
    channel = FakeChannel()

    await declare_topology(cast(AbstractChannel, channel), 3)

    assert DLQ in channel.queues
    assert channel.queues[DLQ].bind_calls == [(DLX, DLQ_ROUTING_KEY)]
    dlq_args = next(args for nome, _, args in channel.queue_calls if nome == DLQ)
    assert dlq_args == QUORUM


async def test_declare_topology_declara_particoes() -> None:
    channel = FakeChannel()

    topologia = await declare_topology(cast(AbstractChannel, channel), 3)

    esperadas = tuple(partition_queue(i) for i in range(3))
    assert topologia.partition_queues == esperadas
    for nome in esperadas:
        args = next(args for chamada, _, args in channel.queue_calls if chamada == nome)
        assert args == {
            **QUORUM,
            "x-dead-letter-exchange": DLX,
            "x-dead-letter-routing-key": DLQ_ROUTING_KEY,
        }
        assert channel.queues[nome].bind_calls == [(RELATOS_EXCHANGE, "1")]


async def test_declare_topology_declara_filas_de_retry() -> None:
    channel = FakeChannel()

    await declare_topology(cast(AbstractChannel, channel), 3)

    for delay_ms in RETRY_DELAYS_MS:
        nome = retry_queue(delay_ms)
        args = next(args for chamada, _, args in channel.queue_calls if chamada == nome)
        assert args == {
            **QUORUM,
            "x-message-ttl": delay_ms,
            "x-dead-letter-exchange": RELATOS_EXCHANGE,
        }
        assert channel.queues[nome].bind_calls == [(RETRY_EXCHANGE, str(delay_ms))]


async def test_publish_usa_padroes_do_envelope() -> None:
    exchange = FakeExchange(EVENTS_EXCHANGE)
    envelope = Envelope(type=TIPO_EVENTO, geohash="6gycfqabcde", payload={"x": 1})

    await publish(cast(AbstractExchange, exchange), envelope)

    assert len(exchange.published) == 1
    message, routing_key = exchange.published[0]
    assert routing_key == "relato.recebido"
    assert message.body == envelope.model_dump_json().encode()
    assert message.message_id == str(envelope.event_id)
    assert message.content_type == "application/json"
    assert message.delivery_mode == aio_pika.DeliveryMode.PERSISTENT
    assert message.headers == {PARTITION_HEADER: "6gycf"}


async def test_publish_aceita_routing_key_e_headers() -> None:
    exchange = FakeExchange(EVENTS_EXCHANGE)
    envelope = Envelope(type=TIPO_EVENTO, geohash="6gycfqabcde", payload={})

    await publish(
        cast(AbstractExchange, exchange),
        envelope,
        routing_key="outra.chave",
        headers={"origem": "teste", PARTITION_HEADER: "ignorado"},
    )

    message, routing_key = exchange.published[0]
    assert routing_key == "outra.chave"
    assert message.headers == {"origem": "teste", PARTITION_HEADER: "6gycf"}
