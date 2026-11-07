"""Consumo com retry exponencial e DLQ (ver ADR 0004).

O handler recebe o Envelope já validado. Regras:
- retorna normalmente      → ack
- levanta PermanentError    → vai direto para a DLQ (sem retry)
- levanta outra exceção     → retry com RETRY_DELAYS_MS[tentativa]; esgotou → DLQ
- corpo não é Envelope válido → DLQ (é permanente)

Publicar na fila de retry/DLQ acontece ANTES do ack da original, então uma queda no meio
gera, no máximo, uma duplicata (o handler é idempotente), nunca uma perda.
"""

import logging
from collections.abc import Awaitable, Callable, Mapping

import aio_pika
from aio_pika.abc import AbstractExchange, AbstractIncomingMessage, AbstractQueue

from ecopulse_common.events import Envelope
from ecopulse_common.messaging import (
    ATTEMPT_HEADER,
    DLQ_ROUTING_KEY,
    ERROR_HEADER,
    RETRY_DELAYS_MS,
    Topology,
)

log = logging.getLogger(__name__)

Handler = Callable[[Envelope], Awaitable[None]]


class PermanentError(Exception):
    """Erro que não adianta tentar de novo (dado inválido, regra de negócio)."""


def _texto_erro(exc: BaseException) -> str:
    return f"{type(exc).__name__}: {exc}"[:500]


def _tentativa(headers: Mapping[str, object]) -> int:
    valor = headers.get(ATTEMPT_HEADER, 0)
    if isinstance(valor, bool):
        return int(valor)
    if isinstance(valor, (int, str)):
        try:
            return int(valor)
        except ValueError:
            return 0
    return 0


async def _republicar(
    message: AbstractIncomingMessage,
    exchange: AbstractExchange,
    routing_key: str,
    *,
    tentativa: int | None = None,
    erro: str | None = None,
) -> None:
    headers = dict(message.headers or {})
    if tentativa is not None:
        headers[ATTEMPT_HEADER] = tentativa
    if erro is not None:
        headers[ERROR_HEADER] = erro

    await exchange.publish(
        aio_pika.Message(
            body=message.body,
            headers=headers,
            content_type=message.content_type or "application/json",
            message_id=message.message_id,
            delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        ),
        routing_key=routing_key,
    )


async def handle_message(
    message: AbstractIncomingMessage, handler: Handler, topology: Topology
) -> None:
    """Aplica as regras do docstring do módulo a UMA mensagem e faz ack ao final.

    Para retry: republica corpo e headers originais em topology.retry com routing_key=str(delay)
    e ATTEMPT_HEADER = tentativa + 1. Para DLQ: republica em topology.dlx com
    routing_key=DLQ_ROUTING_KEY e ERROR_HEADER = "<NomeDaExceção>: <mensagem>" (máx. 500 chars).
    Mantém message_id, content_type e delivery_mode persistente.
    Loga cada decisão com event_id e tentativa.
    """
    headers = dict(message.headers or {})
    attempt = _tentativa(headers)
    event_id = message.message_id

    try:
        envelope = Envelope.model_validate_json(message.body)
    except (TypeError, ValueError) as exc:
        erro = _texto_erro(exc)
        log.error(
            "envelope inválido; enviando para DLQ",
            extra={"event_id": event_id, "attempt": attempt, "error": erro},
        )
        await _republicar(message, topology.dlx, DLQ_ROUTING_KEY, erro=erro)
        await message.ack()
        return

    event_id = str(envelope.event_id)

    try:
        await handler(envelope)
    except PermanentError as exc:
        erro = _texto_erro(exc)
        log.error(
            "erro permanente; enviando para DLQ",
            extra={"event_id": event_id, "attempt": attempt, "error": erro},
        )
        await _republicar(message, topology.dlx, DLQ_ROUTING_KEY, erro=erro)
    except Exception as exc:
        if attempt < len(RETRY_DELAYS_MS):
            delay_ms = RETRY_DELAYS_MS[attempt]
            log.warning(
                "falha; reagendando retry",
                extra={
                    "event_id": event_id,
                    "attempt": attempt,
                    "delay_ms": delay_ms,
                    "error": _texto_erro(exc),
                },
            )
            await _republicar(
                message,
                topology.retry,
                str(delay_ms),
                tentativa=attempt + 1,
            )
        else:
            erro = _texto_erro(exc)
            log.error(
                "tentativas esgotadas; enviando para DLQ",
                extra={"event_id": event_id, "attempt": attempt, "error": erro},
            )
            await _republicar(message, topology.dlx, DLQ_ROUTING_KEY, erro=erro)
    else:
        log.info(
            "mensagem processada",
            extra={"event_id": event_id, "attempt": attempt},
        )

    await message.ack()


async def consume(queue: AbstractQueue, handler: Handler, topology: Topology) -> None:
    """Registra handle_message como consumidor da fila (sem auto-ack)."""

    async def _callback(message: AbstractIncomingMessage) -> None:
        await handle_message(message, handler, topology)

    await queue.consume(_callback, no_ack=False)
