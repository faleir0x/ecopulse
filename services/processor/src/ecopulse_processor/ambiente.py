"""Grava as leituras do serviço environment (evento leitura.ambiente) no PostGIS."""

import logging

import asyncpg
from aio_pika.abc import AbstractChannel, AbstractExchange

from ecopulse_common import messaging
from ecopulse_common.config import Settings
from ecopulse_common.consumer import assinar
from ecopulse_common.events import Envelope, LeituraAmbiente

FILA = "processor.ambiente"
BINDING = "leitura.ambiente"

log = logging.getLogger(__name__)


async def gravar(pool: asyncpg.Pool, leitura: LeituraAmbiente) -> bool:
    """INSERT em leituras_ambiente (geohash, medido_em, leitura=model_dump_json) com
    ON CONFLICT DO NOTHING. True se gravou, False se já existia (reentrega)."""
    async with pool.acquire() as conn:
        resultado: str = await conn.execute(
            """
            INSERT INTO leituras_ambiente (geohash, medido_em, leitura)
            VALUES ($1, $2, $3)
            ON CONFLICT (geohash, medido_em) DO NOTHING
            """,
            leitura.geohash,
            leitura.medido_em,
            leitura.model_dump_json(),
        )
    return resultado == "INSERT 0 1"


async def iniciar(channel: AbstractChannel, events: AbstractExchange, pool: asyncpg.Pool) -> None:
    """Declara FILA (durável), liga em `events` com BINDING e consome via assinar:
    corpo → Envelope → LeituraAmbiente.model_validate(payload) → gravar → ack.
    Postgres fora do ar é transitório: backoff e nack(requeue=True) sem gastar tentativa.
    Corpo/evento inválido e demais erros seguem a política do assinar (retry e DLQ)."""

    async def _processar(envelope: Envelope) -> None:
        leitura = LeituraAmbiente.model_validate(envelope.payload)
        await gravar(pool, leitura)

    dlx = (await messaging.declare_topology(channel, Settings().partitions)).dlx
    await assinar(channel, events, FILA, (BINDING,), _processar, dlx=dlx)
