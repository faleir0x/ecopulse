import asyncio
from datetime import UTC, datetime
from uuid import uuid4

import aio_pika
import asyncpg
import pytest
from aio_pika.abc import AbstractChannel, AbstractConnection, AbstractQueue

from ecopulse_common import geohash, messaging
from ecopulse_common.config import Settings
from ecopulse_common.events import Envelope, EventType, HoraPrevista, LeituraAmbiente
from ecopulse_processor import ambiente

pytestmark = pytest.mark.integration

LATITUDE = -23.5505
LONGITUDE = -46.6333
CELULA = geohash.encode(LATITUDE, LONGITUDE, geohash.PARTITION_PRECISION)


def _leitura(medido_em: datetime | None = None) -> LeituraAmbiente:
    return LeituraAmbiente(
        geohash=CELULA,
        latitude=LATITUDE,
        longitude=LONGITUDE,
        medido_em=medido_em or datetime(2026, 11, 8, 12, 0, tzinfo=UTC),
        fonte="simulador",
        temperatura=27.5,
        sensacao=29.0,
        codigo_tempo=1,
        minima_dia=21.0,
        maxima_dia=31.0,
        aqi=42,
        chuva_mm_h=0.0,
        proximas_horas=[
            HoraPrevista(
                hora=datetime(2026, 11, 8, 13, 0, tzinfo=UTC),
                temperatura=28.0,
                codigo_tempo=1,
                chuva_mm=0.0,
            )
        ],
        chuva_3h=[0.0] * 12,
    )


def _envelope(leitura: LeituraAmbiente) -> Envelope:
    return Envelope(
        type=EventType.LEITURA_AMBIENTE,
        geohash=geohash.encode(leitura.latitude, leitura.longitude, geohash.CELL_PRECISION),
        payload=leitura.model_dump(mode="json"),
    )


async def _limpar(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM leituras_ambiente WHERE geohash = $1", CELULA)


async def _esperar_linha(pool: asyncpg.Pool, medido_em: datetime) -> asyncpg.Record | None:
    for _ in range(100):
        async with pool.acquire() as conn:
            linha = await conn.fetchrow(
                """
                SELECT geohash, medido_em, leitura
                FROM leituras_ambiente
                WHERE geohash = $1 AND medido_em = $2
                """,
                CELULA,
                medido_em,
            )
        if linha is not None:
            return linha
        await asyncio.sleep(0.1)
    return None


async def _contar(pool: asyncpg.Pool, medido_em: datetime) -> int:
    async with pool.acquire() as conn:
        return int(
            await conn.fetchval(
                """
                SELECT count(*) FROM leituras_ambiente
                WHERE geohash = $1 AND medido_em = $2
                """,
                CELULA,
                medido_em,
            )
        )


async def _preparar_fila(
    canal: AbstractChannel,
) -> tuple[messaging.Topology, AbstractQueue]:
    topology = await messaging.declare_topology(canal, Settings().partitions)
    fila = await canal.declare_queue(ambiente.FILA, durable=True, arguments=messaging.QUORUM)
    await fila.purge()
    return topology, fila


async def _consumir(
    connection: AbstractConnection, pool: asyncpg.Pool, topology: messaging.Topology
) -> AbstractChannel:
    canal = await connection.channel()
    await ambiente.iniciar(canal, topology.events, pool)
    return canal


async def test_gravar_e_idempotente(pool: asyncpg.Pool) -> None:
    leitura = _leitura()
    await _limpar(pool)

    try:
        assert await ambiente.gravar(pool, leitura) is True
        assert await ambiente.gravar(pool, leitura) is False
        assert await _contar(pool, leitura.medido_em) == 1
    finally:
        await _limpar(pool)


async def test_publica_e_reentrega_nao_duplica(pool: asyncpg.Pool) -> None:
    try:
        connection = await messaging.connect(Settings().rabbit_url)
    except Exception as exc:
        pytest.skip(f"RabbitMQ indisponível em {Settings().rabbit_url}: {exc}")

    leitura = _leitura()
    envelope = _envelope(leitura)
    await _limpar(pool)
    canal = await connection.channel()
    canal_consumo: AbstractChannel | None = None
    try:
        topology, _ = await _preparar_fila(canal)
        canal_consumo = await _consumir(connection, pool, topology)

        await messaging.publish(topology.events, envelope)

        linha = await _esperar_linha(pool, leitura.medido_em)
        assert linha is not None
        assert LeituraAmbiente.model_validate_json(linha["leitura"]) == leitura

        await messaging.publish(topology.events, envelope)
        await asyncio.sleep(0.5)

        assert await _contar(pool, leitura.medido_em) == 1
    finally:
        if canal_consumo is not None:
            await canal_consumo.close()
        await canal.close()
        await connection.close()
        await _limpar(pool)


async def test_corpo_invalido_e_descartado_sem_travar_a_fila(pool: asyncpg.Pool) -> None:
    try:
        connection = await messaging.connect(Settings().rabbit_url)
    except Exception as exc:
        pytest.skip(f"RabbitMQ indisponível em {Settings().rabbit_url}: {exc}")

    leitura = _leitura(datetime(2026, 11, 8, 13, 0, tzinfo=UTC))
    await _limpar(pool)
    canal = await connection.channel()
    canal_consumo: AbstractChannel | None = None
    try:
        topology, _ = await _preparar_fila(canal)
        canal_consumo = await _consumir(connection, pool, topology)

        await topology.events.publish(
            aio_pika.Message(body=b"isto nao e um envelope", message_id=str(uuid4())),
            routing_key=ambiente.BINDING,
        )
        await messaging.publish(topology.events, _envelope(leitura))

        linha = await _esperar_linha(pool, leitura.medido_em)
        assert linha is not None
        assert LeituraAmbiente.model_validate_json(linha["leitura"]) == leitura
    finally:
        if canal_consumo is not None:
            await canal_consumo.close()
        await canal.close()
        await connection.close()
        await _limpar(pool)
