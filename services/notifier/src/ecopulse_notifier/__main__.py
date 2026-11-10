"""Entrada do serviço: python -m ecopulse_notifier

- configure_logging("notifier"), pool do banco (ecopulse_common.db.create_pool), Redis
  Cluster (ecopulse_common.cache.create_cluster + initialize), conexão RabbitMQ
  (messaging.connect), canal com set_qos(prefetch_count=20)
- topologia comum (messaging.declare_topology) para obter o exchange de eventos e o DLX;
  fila FILA durável declarada pelo assinar, ligada com as chaves BINDINGS
- enviador: fcm.carregar_credenciais(settings.firebase_credenciais) → fcm.ClienteFcm com um
  httpx.AsyncClient próprio; None → fcm.EnviadorSimulado e log "modo simulado"
- consumo via ecopulse_common.consumer.assinar: Envelope.model_validate_json +
  servico.notificar(..., agora=datetime.now(UTC)); erros já tratados dentro de notificar
  continuam lá, e os demais seguem a política do assinar (transitório com backoff, senão
  retry limitado e DLQ)
- tarefa em paralelo: a cada INTERVALO_LIMPEZA_S chama repositorio.apagar_antigos (loga e
  continua em erro)
- SIGTERM/SIGINT: para de consumir (fecha o canal), cancela a tarefa, fecha httpx, conexão,
  Redis e pool
"""

import asyncio
import contextlib
import logging
import signal
from datetime import UTC, datetime

import asyncpg
import httpx

from ecopulse_common import messaging
from ecopulse_common.cache import create_cluster
from ecopulse_common.config import Settings
from ecopulse_common.consumer import assinar
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

    topology = await messaging.declare_topology(channel, settings.partitions)

    credenciais = fcm.carregar_credenciais(settings.firebase_credenciais)
    cliente_http: httpx.AsyncClient | None = None
    enviador: fcm.Enviador
    if credenciais is None:
        enviador = fcm.EnviadorSimulado()
        log.info("modo simulado")
    else:
        cliente_http = httpx.AsyncClient()
        enviador = fcm.ClienteFcm(credenciais, cliente_http)

    async def _processar(envelope: Envelope) -> None:
        await servico.notificar(envelope, pool, redis, enviador, agora=datetime.now(UTC))

    parar = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sinal in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sinal, parar.set)

    await assinar(channel, topology.events, FILA, BINDINGS, _processar, dlx=topology.dlx)
    limpeza = asyncio.create_task(_limpar_periodicamente(pool, parar))

    await parar.wait()
    log.info("encerrando notifier")

    await channel.close()
    limpeza.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await limpeza

    if cliente_http is not None:
        await cliente_http.aclose()
    await connection.close()
    await redis.aclose()
    await pool.close()
    log.info("notifier encerrado")


if __name__ == "__main__":
    asyncio.run(main())
