from collections.abc import Awaitable, Callable
from typing import Any, cast
from unittest.mock import AsyncMock

import aio_pika
import pytest
from aio_pika.abc import AbstractChannel, AbstractExchange, AbstractIncomingMessage, AbstractQueue

from ecopulse_common.consumer import PermanentError, assinar, consume, handle_message
from ecopulse_common.events import Envelope, EventType
from ecopulse_common.messaging import (
    ATTEMPT_HEADER,
    DLQ_ROUTING_KEY,
    ERROR_HEADER,
    QUORUM,
    Topology,
)

DELIVERY_COUNT_HEADER = "x-delivery-count"


class FakeExchange:
    def __init__(self, chamadas: list[str] | None = None) -> None:
        self.chamadas = chamadas
        self.publicadas: list[tuple[aio_pika.Message, str]] = []

    async def publish(self, message: aio_pika.Message, routing_key: str, **_: Any) -> None:
        self.publicadas.append((message, routing_key))
        if self.chamadas is not None:
            self.chamadas.append("publish")


class FakeMessage:
    def __init__(
        self,
        body: bytes,
        *,
        headers: dict[str, Any] | None = None,
        chamadas: list[str] | None = None,
    ) -> None:
        self.body = body
        self.headers = headers or {}
        self.message_id = "evento-1"
        self.content_type = "application/json"
        self.delivery_mode = aio_pika.DeliveryMode.PERSISTENT
        self.chamadas = chamadas
        self.acks = 0
        self.nacks: list[bool] = []

    async def ack(self, multiple: bool = False) -> None:
        self.acks += 1
        if self.chamadas is not None:
            self.chamadas.append("ack")

    async def nack(self, requeue: bool = False, multiple: bool = False) -> None:
        self.nacks.append(requeue)
        if self.chamadas is not None:
            self.chamadas.append("nack")


class FakeQueue:
    def __init__(self) -> None:
        self.binds: list[tuple[Any, str]] = []
        self.callback: Callable[[AbstractIncomingMessage], Awaitable[None]] | None = None
        self.no_ack: bool | None = None

    async def bind(self, exchange: Any, routing_key: str = "", **_: Any) -> None:
        self.binds.append((exchange, routing_key))

    async def consume(
        self,
        callback: Callable[[AbstractIncomingMessage], Awaitable[None]],
        *,
        no_ack: bool = False,
    ) -> str:
        self.callback = callback
        self.no_ack = no_ack
        return "tag"


class FakeChannel:
    def __init__(self) -> None:
        self.queue = FakeQueue()
        self.declare_calls: list[tuple[str, bool, dict[str, Any] | None]] = []

    async def declare_queue(
        self,
        name: str,
        *,
        durable: bool = False,
        arguments: dict[str, Any] | None = None,
        **_: Any,
    ) -> FakeQueue:
        self.declare_calls.append((name, durable, arguments))
        return self.queue


def _topologia(
    chamadas: list[str] | None = None,
) -> tuple[Topology, FakeExchange, FakeExchange]:
    retry = FakeExchange(chamadas)
    dlx = FakeExchange(chamadas)
    topologia = Topology(
        events=cast(AbstractExchange, FakeExchange(chamadas)),
        relatos=cast(AbstractExchange, FakeExchange(chamadas)),
        retry=cast(AbstractExchange, retry),
        dlx=cast(AbstractExchange, dlx),
        partition_queues=(),
    )
    return topologia, retry, dlx


def _erro(message: aio_pika.Message) -> str:
    assert message.headers is not None
    valor = message.headers[ERROR_HEADER]
    assert isinstance(valor, str)
    return valor


def _corpo() -> bytes:
    envelope = Envelope(type=EventType.RELATO_RECEBIDO, geohash="6gycfq", payload={})
    return envelope.model_dump_json().encode()


async def _sucesso(_: Envelope) -> None:
    return None


async def _falha(_: Envelope) -> None:
    raise RuntimeError("falhou de propósito")


async def _permanente(_: Envelope) -> None:
    raise PermanentError("dado inválido")


async def _nao_deveria_chamar(_: Envelope) -> None:
    raise AssertionError("handler não deveria ser chamado")


async def _transitorio(_: Envelope) -> None:
    raise ConnectionRefusedError("infraestrutura fora do ar")


async def _preparar_assinatura(
    handler: Callable[[Envelope], Awaitable[None]], *, tentativas: int = 3
) -> tuple[FakeQueue, FakeExchange]:
    channel = FakeChannel()
    exchange = FakeExchange()
    dlx = FakeExchange()
    await assinar(
        cast(AbstractChannel, channel),
        cast(AbstractExchange, exchange),
        "fila.teste",
        ("rk.a", "rk.b"),
        handler,
        dlx=cast(AbstractExchange, dlx),
        tentativas=tentativas,
    )
    assert channel.declare_calls == [("fila.teste", True, QUORUM)]
    assert [chave for _, chave in channel.queue.binds] == ["rk.a", "rk.b"]
    assert channel.queue.no_ack is False
    assert channel.queue.callback is not None
    return channel.queue, dlx


async def test_sucesso_faz_ack() -> None:
    chamadas: list[str] = []
    topologia, retry, dlx = _topologia(chamadas)
    message = FakeMessage(_corpo(), chamadas=chamadas)

    await handle_message(cast(AbstractIncomingMessage, message), _sucesso, topologia)

    assert message.acks == 1
    assert chamadas == ["ack"]
    assert retry.publicadas == []
    assert dlx.publicadas == []


@pytest.mark.parametrize(
    ("tentativa", "delay_esperado", "proxima_tentativa"),
    [(0, "1000", 1), (1, "10000", 2), (2, "60000", 3)],
)
async def test_falha_comum_republica_no_retry(
    tentativa: int, delay_esperado: str, proxima_tentativa: int
) -> None:
    chamadas: list[str] = []
    topologia, retry, dlx = _topologia(chamadas)
    message = FakeMessage(
        _corpo(),
        headers={ATTEMPT_HEADER: tentativa},
        chamadas=chamadas,
    )

    await handle_message(cast(AbstractIncomingMessage, message), _falha, topologia)

    assert len(retry.publicadas) == 1
    publicada, routing_key = retry.publicadas[0]
    assert routing_key == delay_esperado
    assert publicada.headers is not None
    assert publicada.headers[ATTEMPT_HEADER] == proxima_tentativa
    assert publicada.message_id == message.message_id
    assert publicada.content_type == "application/json"
    assert publicada.delivery_mode == aio_pika.DeliveryMode.PERSISTENT
    assert publicada.body == message.body
    assert dlx.publicadas == []
    assert chamadas == ["publish", "ack"]
    assert message.acks == 1


async def test_tentativas_esgotadas_vai_para_dlq() -> None:
    chamadas: list[str] = []
    topologia, retry, dlx = _topologia(chamadas)
    message = FakeMessage(
        _corpo(),
        headers={ATTEMPT_HEADER: 3},
        chamadas=chamadas,
    )

    await handle_message(cast(AbstractIncomingMessage, message), _falha, topologia)

    assert retry.publicadas == []
    assert len(dlx.publicadas) == 1
    publicada, routing_key = dlx.publicadas[0]
    assert routing_key == DLQ_ROUTING_KEY
    assert _erro(publicada).startswith("RuntimeError: ")
    assert chamadas == ["publish", "ack"]
    assert message.acks == 1


async def test_erro_permanente_vai_direto_para_dlq() -> None:
    chamadas: list[str] = []
    topologia, retry, dlx = _topologia(chamadas)
    message = FakeMessage(_corpo(), chamadas=chamadas)

    await handle_message(cast(AbstractIncomingMessage, message), _permanente, topologia)

    assert retry.publicadas == []
    assert len(dlx.publicadas) == 1
    publicada, routing_key = dlx.publicadas[0]
    assert routing_key == DLQ_ROUTING_KEY
    assert _erro(publicada).startswith("PermanentError: ")
    assert chamadas == ["publish", "ack"]
    assert message.acks == 1


async def test_json_invalido_vai_para_dlq() -> None:
    chamadas: list[str] = []
    topologia, retry, dlx = _topologia(chamadas)
    message = FakeMessage(b"{isso nao e json", chamadas=chamadas)

    await handle_message(cast(AbstractIncomingMessage, message), _nao_deveria_chamar, topologia)

    assert retry.publicadas == []
    assert len(dlx.publicadas) == 1
    publicada, routing_key = dlx.publicadas[0]
    assert routing_key == DLQ_ROUTING_KEY
    assert _erro(publicada).startswith("ValidationError: ")
    assert chamadas == ["publish", "ack"]
    assert message.acks == 1


async def test_envelope_invalido_vai_para_dlq() -> None:
    chamadas: list[str] = []
    topologia, _, dlx = _topologia(chamadas)
    message = FakeMessage(b'{"type": "relato.recebido"}', chamadas=chamadas)

    await handle_message(cast(AbstractIncomingMessage, message), _nao_deveria_chamar, topologia)

    assert len(dlx.publicadas) == 1
    assert chamadas == ["publish", "ack"]
    assert message.acks == 1


async def test_erro_da_dlq_e_limitado_a_500_caracteres() -> None:
    async def falha_longa(_: Envelope) -> None:
        raise RuntimeError("x" * 1000)

    topologia, _, dlx = _topologia()
    message = FakeMessage(_corpo(), headers={ATTEMPT_HEADER: 3})

    await handle_message(cast(AbstractIncomingMessage, message), falha_longa, topologia)

    publicada, _ = dlx.publicadas[0]
    assert len(_erro(publicada)) == 500


async def test_ack_ocorre_depois_da_publicacao() -> None:
    chamadas: list[str] = []
    topologia, _, _ = _topologia(chamadas)
    message = FakeMessage(
        _corpo(),
        headers={ATTEMPT_HEADER: 3},
        chamadas=chamadas,
    )

    await handle_message(cast(AbstractIncomingMessage, message), _falha, topologia)

    assert chamadas == ["publish", "ack"]


async def test_consume_registra_callback_sem_auto_ack() -> None:
    queue = AsyncMock()
    topologia, _, _ = _topologia()

    await consume(cast(AbstractQueue, queue), _sucesso, topologia)

    queue.consume.assert_awaited_once()
    callback = queue.consume.await_args.args[0]
    assert callable(callback)
    assert queue.consume.await_args.kwargs.get("no_ack") is False


async def test_transitorio_em_handle_message_nao_incrementa_tentativa() -> None:
    chamadas: list[str] = []
    topologia, retry, dlx = _topologia(chamadas)
    message = FakeMessage(
        _corpo(),
        headers={ATTEMPT_HEADER: 2},
        chamadas=chamadas,
    )

    await handle_message(cast(AbstractIncomingMessage, message), _transitorio, topologia)

    assert len(retry.publicadas) == 1
    publicada, routing_key = retry.publicadas[0]
    assert routing_key == "60000"
    assert publicada.headers is not None
    assert publicada.headers[ATTEMPT_HEADER] == 2
    assert dlx.publicadas == []
    assert chamadas == ["publish", "ack"]
    assert message.acks == 1


async def test_transitorio_em_assinar_faz_nack_com_requeue(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    esperas: list[float] = []

    async def _sem_espera(segundos: float) -> None:
        esperas.append(segundos)

    monkeypatch.setattr("ecopulse_common.consumer.asyncio.sleep", _sem_espera)
    fila, dlx = await _preparar_assinatura(_transitorio)
    message = FakeMessage(_corpo(), headers={DELIVERY_COUNT_HEADER: 3})
    callback = fila.callback
    assert callback is not None

    await callback(cast(AbstractIncomingMessage, message))

    assert message.nacks == [True]
    assert message.acks == 0
    assert esperas == [8]
    assert dlx.publicadas == []


async def test_erro_comum_com_tentativas_esgotadas_vai_para_dlq() -> None:
    fila, dlx = await _preparar_assinatura(_falha, tentativas=3)
    message = FakeMessage(_corpo(), headers={DELIVERY_COUNT_HEADER: 2})
    callback = fila.callback
    assert callback is not None

    await callback(cast(AbstractIncomingMessage, message))

    assert message.nacks == []
    assert message.acks == 1
    assert len(dlx.publicadas) == 1
    publicada, routing_key = dlx.publicadas[0]
    assert routing_key == DLQ_ROUTING_KEY
    assert _erro(publicada).startswith("RuntimeError: ")


async def test_envelope_invalido_em_assinar_vai_para_dlq() -> None:
    fila, dlx = await _preparar_assinatura(_nao_deveria_chamar)
    message = FakeMessage(b"{isso nao e json")
    callback = fila.callback
    assert callback is not None

    await callback(cast(AbstractIncomingMessage, message))

    assert message.nacks == []
    assert message.acks == 1
    assert len(dlx.publicadas) == 1
    publicada, routing_key = dlx.publicadas[0]
    assert routing_key == DLQ_ROUTING_KEY
    assert _erro(publicada).startswith("ValidationError: ")


async def test_sucesso_em_assinar_faz_ack() -> None:
    fila, dlx = await _preparar_assinatura(_sucesso)
    message = FakeMessage(_corpo())
    callback = fila.callback
    assert callback is not None

    await callback(cast(AbstractIncomingMessage, message))

    assert message.nacks == []
    assert message.acks == 1
    assert dlx.publicadas == []
