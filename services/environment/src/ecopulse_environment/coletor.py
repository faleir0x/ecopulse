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

VERIFICAR_S = 5  # procura células novas/vencidas a cada 5 s


async def coletar_vencidas(
    redis: RedisCluster, fonte: Fonte, exchange: AbstractExchange, intervalo_s: int, agora_s: float
) -> int:
    """Uma rodada:
    1. celulas_ativas → coletadas_em → vencidas = nunca coletadas ou coletadas há >= intervalo_s
    2. fonte.ler_varias com todas as vencidas (o lote é responsabilidade da fonte); para cada
       leitura devolvida, publica Envelope(type=LEITURA_AMBIENTE,
       geohash=geohash.encode(centro, 6), payload=leitura.model_dump(mode="json")) com
       messaging.publish, e só então marcar_coletada
    3. células ausentes do retorno (falha da fonte) ficam para a próxima rodada, com um warning
       agregado de quantas falharam
    Retorna quantas publicou.
    """
    celulas = await ambiente.celulas_ativas(redis, agora_s)
    coletadas = await ambiente.coletadas_em(redis, celulas)
    vencidas = [
        celula
        for celula in celulas
        if celula not in coletadas or agora_s - coletadas[celula] >= intervalo_s
    ]
    if not vencidas:
        return 0

    centros: dict[str, tuple[float, float]] = {}
    pontos: list[tuple[str, float, float]] = []
    for celula in vencidas:
        lat_min, lon_min, lat_max, lon_max = geohash.decode_bbox(celula)
        latitude = (lat_min + lat_max) / 2
        longitude = (lon_min + lon_max) / 2
        centros[celula] = (latitude, longitude)
        pontos.append((celula, latitude, longitude))

    try:
        leituras = await fonte.ler_varias(pontos)
    except FonteIndisponivel:
        log.warning("fonte indisponível; tentará na próxima rodada", extra={"total": len(vencidas)})
        return 0

    publicadas = 0
    for celula, leitura in leituras.items():
        latitude, longitude = centros.get(celula, (leitura.latitude, leitura.longitude))
        try:
            envelope = Envelope(
                type=EventType.LEITURA_AMBIENTE,
                geohash=geohash.encode(latitude, longitude, geohash.CELL_PRECISION),
                payload=leitura.model_dump(mode="json"),
            )
            await messaging.publish(exchange, envelope)
            await ambiente.marcar_coletada(redis, celula, agora_s)
            publicadas += 1
        except Exception:
            log.exception("falha ao publicar leitura", extra={"geohash": celula})

    faltantes = [celula for celula in vencidas if celula not in leituras]
    if faltantes:
        log.warning(
            "células sem leitura; tentarão na próxima rodada", extra={"total": len(faltantes)}
        )

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
