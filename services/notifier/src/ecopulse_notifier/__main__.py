"""Entrada do serviço: python -m ecopulse_notifier

- configure_logging("notifier"), pool do banco (ecopulse_common.db.create_pool), Redis
  Cluster (ecopulse_common.cache.create_cluster + initialize), conexão RabbitMQ
  (messaging.connect), canal com set_qos(prefetch_count=20)
- exchange messaging.EVENTS_EXCHANGE (topic, durável); fila FILA durável com
  arguments=messaging.QUORUM, ligada com as chaves BINDINGS
- enviador: fcm.carregar_credenciais(settings.firebase_credenciais) → fcm.ClienteFcm com um
  httpx.AsyncClient próprio; None → fcm.EnviadorSimulado e log "modo simulado"
- consumo (sem auto-ack), por mensagem:
  - Envelope.model_validate_json + servico.notificar(..., agora=datetime.now(UTC)) → ack
  - ValueError/ValidationError (evento inválido) → loga warning e ack (descarta)
  - RedisError, asyncpg.PostgresError, OSError → loga warning, espera 1 s e
    nack(requeue=True)
- tarefa em paralelo: a cada INTERVALO_LIMPEZA_S chama repositorio.apagar_antigos (loga e
  continua em erro)
- SIGTERM/SIGINT: para de consumir, cancela a tarefa, fecha httpx, conexão, Redis e pool
"""

import asyncio
import contextlib
import logging
import signal
from datetime import UTC, datetime

import aio_pika
import asyncpg
import httpx
from aio_pika.abc import AbstractIncomingMessage
from pydantic import ValidationError
from redis.exceptions import RedisError

from ecopulse_common import messaging
from ecopulse_common.cache import create_cluster
from ecopulse_common.config import Settings
from ecopulse_common.db import create_pool
from ecopulse_common.events import Envelope
from ecopulse_common.logs import configure_logging
from ecopulse_notifier import fcm, repositorio, servico

log = logging.getLogger(__name__)

FILA = "notifier.ocorrencias"
BINDINGS = ("ocorrencia.criada", "ocorrencia.atualizada")
INTERVALO_LIMPEZA_S = 3600


async def _limpar_periodicamente(pool: asyncpg.Pool, parar: asyncio.Event) -> None:
    while not parar.is_set():
        try:
            total = await repositorio.apagar_antigos(pool, datetime.now(UTC))
            if total:
                log.info("aparelhos antigos apagados", extra={"total": total})
        except Exception:
            log.exception("falha na limpeza periódica de aparelhos")
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(parar.wait(), timeout=INTERVALO_LIMPEZA_S)


async def main() -> None:
    settings = Settings()
    configure_logging("notifier", settings.log_level)
    log.info("iniciando notifier")

    pool = await create_pool(settings.database_url)
    redis = create_cluster(settings)
    await redis.initialize()
    connection = await messaging.connect(settings.rabbit_url)
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=20)

    events = await channel.declare_exchange(
        messaging.EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
    )
    fila = await channel.declare_queue(FILA, durable=True, arguments=messaging.QUORUM)
    for binding in BINDINGS:
        await fila.bind(events, routing_key=binding)

    credenciais = fcm.carregar_credenciais(settings.firebase_credenciais)
    cliente_http: httpx.AsyncClient | None = None
    enviador: fcm.Enviador
    if credenciais is None:
        enviador = fcm.EnviadorSimulado()
        log.info("modo simulado")
    else:
        cliente_http = httpx.AsyncClient()
        enviador = fcm.ClienteFcm(credenciais, cliente_http)

    async def _processar(message: AbstractIncomingMessage) -> None:
        event_id: str | None = None
        try:
            envelope = Envelope.model_validate_json(message.body)
            event_id = str(envelope.event_id)
            await servico.notificar(envelope, pool, redis, enviador, agora=datetime.now(UTC))
        except (ValueError, ValidationError) as exc:
            log.warning(
                "evento inválido descartado",
                extra={"event_id": event_id, "error": f"{type(exc).__name__}: {exc}"},
            )
            await message.ack()
        except (RedisError, asyncpg.PostgresError, OSError) as exc:
            log.warning(
                "falha ao processar evento; reagendando",
                extra={"event_id": event_id, "error": f"{type(exc).__name__}: {exc}"},
            )
            await asyncio.sleep(1)
            await message.nack(requeue=True)
        except Exception:
            # Push é melhor esforço: um erro inesperado não pode prender a mensagem sem ack
            log.exception("erro inesperado; evento descartado", extra={"event_id": event_id})
            await message.ack()
        else:
            await message.ack()

    parar = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sinal in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sinal, parar.set)

    tag = await fila.consume(_processar, no_ack=False)
    limpeza = asyncio.create_task(_limpar_periodicamente(pool, parar))

    await parar.wait()
    log.info("encerrando notifier")

    await fila.cancel(tag)
    limpeza.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await limpeza

    if cliente_http is not None:
        await cliente_http.aclose()
    await channel.close()
    await connection.close()
    await redis.aclose()
    await pool.close()
    log.info("notifier encerrado")


if __name__ == "__main__":
    asyncio.run(main())
