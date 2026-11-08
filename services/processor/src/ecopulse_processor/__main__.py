"""Entrada do worker: python -m ecopulse_processor

- configure_logging("processor"), pool do banco, conexão RabbitMQ
- canal com publisher_confirms=True e set_qos(prefetch_count=20)
- declare_topology(settings.partitions) e consume() em TODAS as filas-partição com
  handler que despacha relato.recebido e resolucao.recebida
- tarefa em paralelo: a cada regras.INTERVALO_EXPIRACAO_S chama expirar_ocorrencias
  (loga e continua em caso de erro)
- SIGTERM/SIGINT: para de consumir, cancela a tarefa, fecha conexão e pool
"""

import asyncio
import contextlib
import logging
import signal

import aio_pika
import asyncpg

from ecopulse_common import messaging
from ecopulse_common.config import Settings
from ecopulse_common.consumer import PermanentError, consume
from ecopulse_common.db import create_pool
from ecopulse_common.events import Envelope, EventType
from ecopulse_common.logs import configure_logging
from ecopulse_processor import ambiente, regras, relay
from ecopulse_processor.servico import (
    expirar_ocorrencias,
    processar_relato,
    processar_resolucao,
)

log = logging.getLogger(__name__)


async def despachar(pool: asyncpg.Pool, envelope: Envelope) -> None:
    """Despacha pelo tipo do envelope. Tipo desconhecido → PermanentError (vai para a DLQ)."""
    if envelope.type is EventType.RELATO_RECEBIDO:
        await processar_relato(pool, envelope)
    elif envelope.type is EventType.RESOLUCAO_RECEBIDA:
        await processar_resolucao(pool, envelope)
    else:
        raise PermanentError(f"evento não suportado no processor: {envelope.type}")


async def _expirar_periodicamente(pool: asyncpg.Pool, parar: asyncio.Event) -> None:
    while not parar.is_set():
        try:
            total = await expirar_ocorrencias(pool)
            if total:
                log.info("expiração periódica concluída", extra={"total": total})
        except Exception:
            log.exception("falha na expiração periódica")
        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(parar.wait(), timeout=regras.INTERVALO_EXPIRACAO_S)


async def main() -> None:
    settings = Settings()
    configure_logging("processor", settings.log_level)
    log.info("iniciando processor")

    pool = await create_pool(settings.database_url, min_size=1, max_size=10)
    connection = await messaging.connect(settings.rabbit_url)
    channel = await connection.channel(publisher_confirms=True)
    await channel.set_qos(prefetch_count=20)
    topology = await messaging.declare_topology(channel, settings.partitions)

    canal_relay = await connection.channel(publisher_confirms=True)
    exchange = await canal_relay.declare_exchange(
        messaging.EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
    )

    canal_ambiente = await connection.channel(publisher_confirms=True)
    await canal_ambiente.set_qos(prefetch_count=20)
    await ambiente.iniciar(canal_ambiente, topology.events, pool)

    async def _handler(envelope: Envelope) -> None:
        await despachar(pool, envelope)

    for nome in topology.partition_queues:
        fila = await channel.get_queue(nome)
        await consume(fila, _handler, topology)

    parar = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sinal in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sinal, parar.set)

    tarefa_expiracao = asyncio.create_task(_expirar_periodicamente(pool, parar))
    tarefa_relay = asyncio.create_task(relay.rodar(pool, exchange, parar))

    await parar.wait()
    log.info("encerrando processor")

    tarefa_expiracao.cancel()
    tarefa_relay.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await tarefa_expiracao
    with contextlib.suppress(asyncio.CancelledError):
        await tarefa_relay

    await canal_ambiente.close()
    await canal_relay.close()
    await channel.close()
    await connection.close()
    await pool.close()
    log.info("processor encerrado")


if __name__ == "__main__":
    asyncio.run(main())
