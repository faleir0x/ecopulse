"""Consumo com retry exponencial e DLQ (ver ADR 0004).

O handler recebe o Envelope já validado. Regras:
- retorna normalmente      → ack
- levanta PermanentError    → vai direto para a DLQ (sem retry)
- levanta exceção transitória (infraestrutura fora do ar) → volta ao retry de maior atraso,
  sem gastar tentativa; a mensagem pode ser aceita de novo quando a infraestrutura voltar
- levanta outra exceção     → retry com RETRY_DELAYS_MS[tentativa]; esgotou → DLQ
- corpo não é Envelope válido → DLQ (é permanente)

Publicar na fila de retry/DLQ acontece ANTES do ack da original, então uma queda no meio
gera, no máximo, uma duplicata (o handler é idempotente), nunca uma perda.

`assinar` atende os consumidores de eventos com fila própria: backoff em processo para
erros transitórios (sem limite de reentregas) e DLQ depois de `tentativas` entregas.
"""

import asyncio
import logging
from collections.abc import Awaitable, Callable, Mapping, Sequence

import aio_pika
import asyncpg
from aio_pika.abc import AbstractChannel, AbstractExchange, AbstractIncomingMessage, AbstractQueue
from pydantic import ValidationError
from redis import exceptions as redis_exceptions

from ecopulse_common.events import Envelope
from ecopulse_common.messaging import (
    ATTEMPT_HEADER,
    DLQ_ROUTING_KEY,
    ERROR_HEADER,
    QUORUM,
    RETRY_DELAYS_MS,
    Topology,
)

log = logging.getLogger(__name__)

Handler = Callable[[Envelope], Awaitable[None]]

_DELIVERY_COUNT_HEADER = "x-delivery-count"


class PermanentError(Exception):
    """Erro que não adianta tentar de novo (dado inválido, regra de negócio)."""


# Infraestrutura fora do ar (banco, Redis, rede): tentar de novo resolve quando ela voltar,
# então não gasta tentativa nem vai para a DLQ. Ver e_transitorio.
TRANSITORIOS: tuple[type[BaseException], ...] = (
    OSError,
    TimeoutError,
    asyncio.TimeoutError,
    asyncpg.exceptions.PostgresConnectionError,
    asyncpg.exceptions.InterfaceError,
    asyncpg.exceptions.CannotConnectNowError,
    asyncpg.exceptions.TooManyConnectionsError,
    asyncpg.exceptions.AdminShutdownError,
    redis_exceptions.ConnectionError,
    redis_exceptions.TimeoutError,
    redis_exceptions.ClusterDownError,
    redis_exceptions.TryAgainError,
)


def e_transitorio(exc: BaseException) -> bool:
    """True se a exceção indica infraestrutura indisponível (isinstance de TRANSITORIOS)."""
    return isinstance(exc, TRANSITORIOS)


def _texto_erro(exc: BaseException) -> str:
    return f"{type(exc).__name__}: {exc}"[:500]


def _inteiro(headers: Mapping[str, object], chave: str) -> int:
    valor = headers.get(chave, 0)
    if isinstance(valor, bool):
        return int(valor)
    if isinstance(valor, (int, str)):
        try:
            return int(valor)
        except ValueError:
            return 0
    return 0


def _tentativa(headers: Mapping[str, object]) -> int:
    return _inteiro(headers, ATTEMPT_HEADER)


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
        if e_transitorio(exc):
            delay_ms = RETRY_DELAYS_MS[-1]
            log.warning(
                "infraestrutura indisponível; aguardando",
                extra={
                    "event_id": event_id,
                    "attempt": attempt,
                    "delay_ms": delay_ms,
                    "error": _texto_erro(exc),
                },
            )
            await _republicar(message, topology.retry, str(delay_ms))
        elif attempt < len(RETRY_DELAYS_MS):
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


async def assinar(
    channel: AbstractChannel,
    exchange: AbstractExchange,
    fila: str,
    bindings: Sequence[str],
    handler: Handler,
    *,
    dlx: AbstractExchange,
    tentativas: int = 3,
) -> AbstractQueue:
    """Consumidor de eventos com fila própria (quorum, durável) ligada a `exchange`.

    Declara `fila` com messaging.QUORUM, liga em `exchange` com cada routing key de
    `bindings` e consome sem auto-ack. Para cada mensagem:
    - corpo não é Envelope válido ou handler levanta PermanentError ou ValidationError
      (payload inválido) → republica em `dlx`
      (routing key DLQ_ROUTING_KEY, header ERROR_HEADER) e ack
    - handler levanta erro transitório (e_transitorio) → espera min(30, 2**n) s, com n =
      header x-delivery-count (0 na 1ª entrega), e nack(requeue=True); sem limite
    - outra exceção → nack(requeue=True) enquanto x-delivery-count + 1 < tentativas;
      depois disso, DLQ como acima e ack
    - sucesso → ack
    Usado pelos consumidores de ocorrencia.* e leitura.ambiente (fan-out); o caminho dos
    relatos (partições + filas de retry) continua em consume/handle_message.
    Retorna a fila declarada.
    """
    declarada = await channel.declare_queue(fila, durable=True, arguments=QUORUM)
    for binding in bindings:
        await declarada.bind(exchange, routing_key=binding)

    async def _processar(message: AbstractIncomingMessage) -> None:
        headers = dict(message.headers or {})
        reentregas = max(0, _inteiro(headers, _DELIVERY_COUNT_HEADER))
        event_id = message.message_id

        try:
            envelope = Envelope.model_validate_json(message.body)
        except (TypeError, ValueError) as exc:
            erro = _texto_erro(exc)
            log.error(
                "envelope inválido; enviando para DLQ",
                extra={"event_id": event_id, "delivery_count": reentregas, "error": erro},
            )
            await _republicar(message, dlx, DLQ_ROUTING_KEY, erro=erro)
            await message.ack()
            return

        event_id = str(envelope.event_id)

        try:
            await handler(envelope)
        except (PermanentError, ValidationError) as exc:
            # Payload que não valida não muda ao tentar de novo
            erro = _texto_erro(exc)
            log.error(
                "erro permanente; enviando para DLQ",
                extra={"event_id": event_id, "delivery_count": reentregas, "error": erro},
            )
            await _republicar(message, dlx, DLQ_ROUTING_KEY, erro=erro)
            await message.ack()
        except Exception as exc:
            if e_transitorio(exc):
                espera = min(30, 2**reentregas)
                log.warning(
                    "infraestrutura indisponível; aguardando",
                    extra={
                        "event_id": event_id,
                        "delivery_count": reentregas,
                        "wait_s": espera,
                        "error": _texto_erro(exc),
                    },
                )
                await asyncio.sleep(espera)
                await message.nack(requeue=True)
            elif reentregas + 1 < tentativas:
                log.warning(
                    "falha; reagendando entrega",
                    extra={
                        "event_id": event_id,
                        "delivery_count": reentregas,
                        "attempts": tentativas,
                        "error": _texto_erro(exc),
                    },
                )
                await message.nack(requeue=True)
            else:
                erro = _texto_erro(exc)
                log.error(
                    "tentativas esgotadas; enviando para DLQ",
                    extra={
                        "event_id": event_id,
                        "delivery_count": reentregas,
                        "error": erro,
                    },
                )
                await _republicar(message, dlx, DLQ_ROUTING_KEY, erro=erro)
                await message.ack()
        else:
            # debug: "mensagem processada" (info) é do caminho dos relatos; infra/demo/escala.sh
            # conta essa frase para mostrar a divisão de carga entre as réplicas do processor
            log.debug(
                "evento processado",
                extra={"event_id": event_id, "delivery_count": reentregas},
            )
            await message.ack()

    await declarada.consume(_processar, no_ack=False)
    return declarada
