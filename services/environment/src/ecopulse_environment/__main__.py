"""python -m ecopulse_environment

configure_logging("environment"); Redis Cluster; RabbitMQ (canal com publisher confirms) e
exchange EVENTS_EXCHANGE; fonte = OpenMeteo(httpx.AsyncClient(timeout=TIMEOUT_S)) ou
Simulador conforme settings.ambiente_fonte ("simulador-calor" = Simulador(onda_de_calor=True));
coletor.rodar com settings.ambiente_intervalo_s; SIGTERM/SIGINT encerram limpo.
"""

import asyncio
import logging
import signal

import aio_pika
import httpx

from ecopulse_common import messaging
from ecopulse_common.cache import create_cluster
from ecopulse_common.config import Settings
from ecopulse_common.logs import configure_logging
from ecopulse_environment import coletor
from ecopulse_environment.fontes import TIMEOUT_S, Fonte, OpenMeteo, Simulador

log = logging.getLogger(__name__)


async def main() -> None:
    settings = Settings()
    configure_logging("environment", settings.log_level)
    log.info("iniciando environment", extra={"fonte": settings.ambiente_fonte})

    redis = create_cluster(settings)
    connection = await messaging.connect(settings.rabbit_url)
    channel = await connection.channel(publisher_confirms=True)
    exchange = await channel.declare_exchange(
        messaging.EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
    )

    cliente_http: httpx.AsyncClient | None = None
    fonte: Fonte
    if settings.ambiente_fonte == "simulador":
        fonte = Simulador()
    elif settings.ambiente_fonte == "simulador-calor":
        fonte = Simulador(onda_de_calor=True)
    else:
        cliente_http = httpx.AsyncClient(timeout=TIMEOUT_S)
        fonte = OpenMeteo(cliente_http)

    parar = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sinal in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sinal, parar.set)

    try:
        await coletor.rodar(redis, fonte, exchange, settings.ambiente_intervalo_s, parar)
    finally:
        log.info("encerrando environment")
        if cliente_http is not None:
            await cliente_http.aclose()
        await channel.close()
        await connection.close()
        await redis.aclose()
        log.info("environment encerrado")


if __name__ == "__main__":
    asyncio.run(main())
