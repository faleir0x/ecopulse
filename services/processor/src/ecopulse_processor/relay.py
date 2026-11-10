"""Relay da transactional outbox (ver ADR 0004).

Publica no exchange de eventos as linhas pendentes da tabela `outbox` e as marca como
publicadas. Entrega at-least-once: se cair entre o publish e o commit, a linha é publicada
de novo depois; os consumidores são idempotentes por event_id.
Seguro com várias réplicas (FOR UPDATE SKIP LOCKED).
"""

import asyncio
import contextlib
import logging
import time
from datetime import timedelta

import asyncpg
from aio_pika.abc import AbstractExchange
from pydantic import ValidationError

from ecopulse_common import messaging
from ecopulse_common.events import Envelope

log = logging.getLogger(__name__)

LOTE = 100
INTERVALO_S = 0.5
RETENCAO = timedelta(days=7)
INTERVALO_LIMPEZA_S = 3600.0


async def publicar_pendentes(
    pool: asyncpg.Pool, exchange: AbstractExchange, lote: int = LOTE
) -> int:
    """Uma transação:
    1. SELECT id, envelope FROM outbox WHERE publicado_em IS NULL ORDER BY id LIMIT lote
       FOR UPDATE SKIP LOCKED
    2. para cada linha, em ordem: Envelope.model_validate_json(envelope) e
       messaging.publish(exchange, envelope) (routing key = tipo do evento)
    3. UPDATE outbox SET publicado_em = now() WHERE id = ANY($1)
    Se um publish falhar, a exceção sobe e a transação é desfeita (nada marcado).
    Linha que não valida como Envelope (ex.: tipo de evento novo durante uma atualização) não
    trava o lote: é logada (id e erro, sem o payload) e marcada como publicada junto com as
    demais para sair da fila.
    Retorna quantas linhas processou.
    """
    async with pool.acquire() as conn, conn.transaction():
        linhas = await conn.fetch(
            """
            SELECT id, envelope
            FROM outbox
            WHERE publicado_em IS NULL
            ORDER BY id
            LIMIT $1
            FOR UPDATE SKIP LOCKED
            """,
            lote,
        )

        marcadas: list[int] = []
        for linha in linhas:
            try:
                envelope = Envelope.model_validate_json(linha["envelope"])
            except ValidationError as exc:
                log.error(
                    "envelope inválido na outbox; linha descartada",
                    extra={"id": linha["id"], "erro": str(exc)},
                )
            else:
                await messaging.publish(exchange, envelope)
            marcadas.append(linha["id"])

        if marcadas:
            await conn.execute(
                "UPDATE outbox SET publicado_em = now() WHERE id = ANY($1::bigint[])",
                marcadas,
            )

    return len(linhas)


async def limpar_publicados(pool: asyncpg.Pool, retencao: timedelta = RETENCAO) -> int:
    """DELETE das linhas publicadas há mais de `retencao`. Retorna quantas apagou."""
    async with pool.acquire() as conn:
        total = await conn.fetchval(
            """
            WITH apagadas AS (
                DELETE FROM outbox
                WHERE publicado_em IS NOT NULL
                  AND publicado_em < now() - $1::interval
                RETURNING id
            )
            SELECT count(*) FROM apagadas
            """,
            retencao,
        )
    return int(total)


async def rodar(pool: asyncpg.Pool, exchange: AbstractExchange, parar: asyncio.Event) -> None:
    """Laço até `parar`: chama publicar_pendentes; se publicou um lote cheio, repete sem
    esperar (há fila acumulada); senão espera INTERVALO_S (ou até `parar`).
    Erros são logados e o laço continua após INTERVALO_S. Falha na limpeza periódica só
    gera warning: a próxima tentativa fica para daqui a INTERVALO_LIMPEZA_S."""
    proxima_limpeza = 0.0

    while not parar.is_set():
        try:
            agora = time.monotonic()
            if agora >= proxima_limpeza:
                proxima_limpeza = agora + INTERVALO_LIMPEZA_S
                try:
                    apagadas = await limpar_publicados(pool)
                except Exception:
                    log.warning("falha ao limpar a outbox", exc_info=True)
                else:
                    if apagadas:
                        log.info("outbox limpa", extra={"total": apagadas})

            publicados = await publicar_pendentes(pool, exchange)
            if publicados >= LOTE:
                continue
        except Exception:
            log.exception("falha no relay da outbox")

        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(parar.wait(), timeout=INTERVALO_S)
