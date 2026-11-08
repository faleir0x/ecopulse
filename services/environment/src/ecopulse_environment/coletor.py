"""Laço de coleta: para cada célula de interesse vencida, lê a fonte e publica leitura.ambiente."""

import asyncio
import contextlib
import logging
import time

from aio_pika.abc import AbstractExchange
from redis.asyncio.cluster import RedisCluster

from ecopulse_common import ambiente, geohash, messaging
from ecopulse_common.events import Envelope, EventType
from ecopulse_environment.fontes import Fonte, FonteIndisponivel

log = logging.getLogger(__name__)

VERIFICAR_S = 30  # procura células novas/vencidas a cada 30 s
PARALELO = 4  # leituras simultâneas na fonte externa


async def coletar_vencidas(
    redis: RedisCluster, fonte: Fonte, exchange: AbstractExchange, intervalo_s: int, agora_s: float
) -> int:
    """Uma rodada:
    1. celulas_ativas → coletadas_em → vencidas = nunca coletadas ou coletadas há >= intervalo_s
    2. para cada vencida (até PARALELO ao mesmo tempo, asyncio.Semaphore): centro da célula
       (geohash.decode_bbox), fonte.ler, publica Envelope(type=LEITURA_AMBIENTE,
       geohash=geohash.encode(centro, 6), payload=leitura.model_dump(mode="json")) com
       messaging.publish, e só então marcar_coletada
    3. FonteIndisponivel numa célula: loga warning e segue com as outras (tenta na próxima rodada)
    Retorna quantas publicou.
    """
    celulas = await ambiente.celulas_ativas(redis, agora_s)
    coletadas = await ambiente.coletadas_em(redis, celulas)
    vencidas = [
        celula
        for celula in celulas
        if celula not in coletadas or agora_s - coletadas[celula] >= intervalo_s
    ]

    semaforo = asyncio.Semaphore(PARALELO)
    publicadas = 0

    async def _coletar(celula: str) -> None:
        nonlocal publicadas
        async with semaforo:
            try:
                lat_min, lon_min, lat_max, lon_max = geohash.decode_bbox(celula)
                latitude = (lat_min + lat_max) / 2
                longitude = (lon_min + lon_max) / 2
                leitura = await fonte.ler(celula, latitude, longitude)
                envelope = Envelope(
                    type=EventType.LEITURA_AMBIENTE,
                    geohash=geohash.encode(latitude, longitude, geohash.CELL_PRECISION),
                    payload=leitura.model_dump(mode="json"),
                )
                await messaging.publish(exchange, envelope)
                await ambiente.marcar_coletada(redis, celula, agora_s)
                publicadas += 1
            except FonteIndisponivel:
                log.warning(
                    "fonte indisponível; tentará na próxima rodada", extra={"geohash": celula}
                )
            except Exception:
                log.exception("falha ao coletar célula", extra={"geohash": celula})

    await asyncio.gather(*(_coletar(celula) for celula in vencidas))
    return publicadas


async def rodar(
    redis: RedisCluster,
    fonte: Fonte,
    exchange: AbstractExchange,
    intervalo_s: int,
    parar: asyncio.Event,
) -> None:
    """Laço até `parar`: coletar_vencidas e espera VERIFICAR_S (ou até parar). Erros logados."""
    while not parar.is_set():
        try:
            publicadas = await coletar_vencidas(redis, fonte, exchange, intervalo_s, time.time())
            if publicadas:
                log.info("leituras ambientais publicadas", extra={"total": publicadas})
        except Exception:
            log.exception("falha na rodada de coleta")

        with contextlib.suppress(TimeoutError):
            await asyncio.wait_for(parar.wait(), timeout=VERIFICAR_S)
