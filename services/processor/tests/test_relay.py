import asyncio
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any, cast
from uuid import UUID, uuid4

import aio_pika
import asyncpg
import pytest
from aio_pika.abc import (
    AbstractChannel,
    AbstractExchange,
    AbstractIncomingMessage,
    AbstractQueue,
)

from ecopulse_common import geohash, messaging
from ecopulse_common.config import Settings
from ecopulse_common.events import Envelope, EventType, RelatoRecebido, Severidade, TipoRisco
from ecopulse_processor import relay
from ecopulse_processor.servico import processar_relato

PONTOS = [
    (-23.5505, -46.6333),
    (-22.9068, -43.1729),
    (-3.7319, -38.5267),
]


def _envelope(latitude: float, longitude: float) -> Envelope:
    payload = RelatoRecebido(
        client_id=uuid4(),
        device_id=uuid4(),
        tipo=TipoRisco.ALAGAMENTO,
        severidade=Severidade.ALTO,
        descricao=None,
        latitude=latitude,
        longitude=longitude,
        registrado_em=datetime.now(UTC),
    )
    return Envelope(
        type=EventType.RELATO_RECEBIDO,
        geohash=geohash.encode(latitude, longitude, geohash.CELL_PRECISION),
        payload=payload.model_dump(mode="json"),
    )


async def _inserir_pendentes(pool: asyncpg.Pool) -> None:
    for latitude, longitude in PONTOS:
        await processar_relato(pool, _envelope(latitude, longitude))


async def _ids_outbox(pool: asyncpg.Pool) -> list[UUID]:
    async with pool.acquire() as conn:
        linhas = await conn.fetch("SELECT event_id FROM outbox ORDER BY id")
    return [linha["event_id"] for linha in linhas]


async def _pendentes(pool: asyncpg.Pool) -> int:
    async with pool.acquire() as conn:
        return int(await conn.fetchval("SELECT count(*) FROM outbox WHERE publicado_em IS NULL"))


async def _receber(fila: AbstractQueue, quantidade: int) -> list[AbstractIncomingMessage]:
    mensagens: list[AbstractIncomingMessage] = []
    for _ in range(100):
        while len(mensagens) < quantidade:
            mensagem = await fila.get(no_ack=True, fail=False)
            if mensagem is None:
                break
            mensagens.append(mensagem)
        if len(mensagens) >= quantidade:
            break
        await asyncio.sleep(0.05)
    return mensagens


@pytest.fixture
async def channel() -> AsyncIterator[AbstractChannel]:
    try:
        connection = await messaging.connect(Settings().rabbit_url)
    except Exception as exc:
        pytest.skip(f"RabbitMQ indisponível em {Settings().rabbit_url}: {exc}")

    try:
        yield await connection.channel(publisher_confirms=True)
    finally:
        await connection.close()


@pytest.fixture
async def exchange(channel: AbstractChannel) -> AbstractExchange:
    return await channel.declare_exchange(
        messaging.EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
    )


@pytest.fixture
async def fila_eventos(
    channel: AbstractChannel, exchange: AbstractExchange
) -> AsyncIterator[AbstractQueue]:
    fila = await channel.declare_queue("", exclusive=True)
    await fila.bind(exchange, routing_key="ocorrencia.*")
    yield fila


class _ExchangeComFalha:
    async def publish(self, *args: Any, **kwargs: Any) -> None:
        raise RuntimeError("broker indisponível")


@pytest.mark.integration
async def test_publicar_pendentes_publica_em_ordem(
    pool: asyncpg.Pool, exchange: AbstractExchange, fila_eventos: AbstractQueue
) -> None:
    await _inserir_pendentes(pool)
    ids = await _ids_outbox(pool)
    assert len(ids) == 3

    assert await relay.publicar_pendentes(pool, exchange) == 3

    mensagens = await _receber(fila_eventos, 3)
    assert [mensagem.message_id for mensagem in mensagens] == [str(event_id) for event_id in ids]
    assert await _pendentes(pool) == 0

    assert await relay.publicar_pendentes(pool, exchange) == 0


@pytest.mark.integration
async def test_publicar_pendentes_respeita_o_lote(
    pool: asyncpg.Pool, exchange: AbstractExchange
) -> None:
    await _inserir_pendentes(pool)

    assert await relay.publicar_pendentes(pool, exchange, lote=2) == 2
    assert await relay.publicar_pendentes(pool, exchange, lote=2) == 1
    assert await _pendentes(pool) == 0


@pytest.mark.integration
async def test_falha_de_publish_nao_marca_nada(pool: asyncpg.Pool) -> None:
    await _inserir_pendentes(pool)
    exchange = cast(AbstractExchange, _ExchangeComFalha())

    with pytest.raises(RuntimeError):
        await relay.publicar_pendentes(pool, exchange)

    assert await _pendentes(pool) == 3


@pytest.mark.integration
async def test_limpar_publicados_respeita_retencao(pool: asyncpg.Pool) -> None:
    await _inserir_pendentes(pool)

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE outbox SET publicado_em = now() - interval '8 days' WHERE id = 1"
        )
        await conn.execute("UPDATE outbox SET publicado_em = now() - interval '1 day' WHERE id = 2")

    assert await relay.limpar_publicados(pool) == 1

    async with pool.acquire() as conn:
        restantes = [linha["id"] for linha in await conn.fetch("SELECT id FROM outbox ORDER BY id")]
    assert restantes == [2, 3]


@pytest.mark.integration
async def test_rodar_publica_e_termina(
    pool: asyncpg.Pool, exchange: AbstractExchange, fila_eventos: AbstractQueue
) -> None:
    await _inserir_pendentes(pool)

    parar = asyncio.Event()
    tarefa = asyncio.create_task(relay.rodar(pool, exchange, parar))
    await asyncio.sleep(0.2)
    parar.set()
    await asyncio.wait_for(tarefa, timeout=5)

    assert await _pendentes(pool) == 0
    assert len(await _receber(fila_eventos, 3)) == 3
