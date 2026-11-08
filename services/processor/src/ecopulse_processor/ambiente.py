"""Grava as leituras do serviço environment (evento leitura.ambiente) no PostGIS."""

import asyncio
import logging

import asyncpg
from aio_pika.abc import AbstractChannel, AbstractExchange, AbstractIncomingMessage

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
    """Declara FILA (durável), liga em `events` com BINDING e consome (sem auto-ack):
    corpo → Envelope → LeituraAmbiente.model_validate(payload) → gravar → ack.
    Corpo inválido: log warning + ack (descarta). Erro de banco: log, espera 1 s,
    nack(requeue=True)."""

    async def _processar(message: AbstractIncomingMessage) -> None:
        event_id = message.message_id
        try:
            envelope = Envelope.model_validate_json(message.body)
            event_id = str(envelope.event_id)
            leitura = LeituraAmbiente.model_validate(envelope.payload)
        except (TypeError, ValueError) as exc:
            log.warning(
                "leitura ambiente inválida; descartando",
                extra={"event_id": event_id, "error": f"{type(exc).__name__}: {exc}"},
            )
            await message.ack()
            return

        try:
            await gravar(pool, leitura)
        except Exception as exc:
            log.warning(
                "falha ao gravar leitura ambiente; reagendando",
                extra={"event_id": event_id, "error": f"{type(exc).__name__}: {exc}"},
            )
            await asyncio.sleep(1)
            await message.nack(requeue=True)
            return

        await message.ack()

    fila = await channel.declare_queue(FILA, durable=True)
    await fila.bind(events, routing_key=BINDING)
    await fila.consume(_processar, no_ack=False)
