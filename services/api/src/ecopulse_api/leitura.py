"""Leitura de ocorrências com cache-aside no Redis Cluster (ver ADR 0005).

Cache por célula geohash5: a chave usa hash tag ({...}), então cada célula vai para um slot
e as células se espalham pelos 3 nós do cluster. Valor = JSON com a lista de ocorrências
ATIVAS cujo geohash começa com a célula. TTL curto + invalidação por evento.
Se o Redis falhar, a leitura cai direto no banco (log de warning) — o cache nunca derruba a API.
"""

import asyncpg
from redis.asyncio.cluster import RedisCluster

from ecopulse_common.events import OcorrenciaPayload, TipoRisco

CACHE_TTL_S = 30
MAX_CELULAS = 64


def chave_celula(geohash5: str) -> str:
    return f"cell:{{{geohash5}}}:ocorrencias"


def celulas_do_bbox(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> list[str]:
    """Células geohash precisão PARTITION_PRECISION (5) que cobrem o bbox, sem repetição.

    Percorre uma grade com passo menor que a célula (use geohash.decode_bbox de uma célula
    para obter largura/altura) incluindo as bordas. ValueError se min > max, coordenadas fora
    do intervalo, ou se precisar de mais de MAX_CELULAS (o app deve aproximar o zoom).
    Bbox que cruza o antimeridiano não é suportado (ValueError).
    """
    raise NotImplementedError  # TODO(worker)


async def ocorrencias_por_celulas(
    pool: asyncpg.Pool, redis: RedisCluster, celulas: list[str]
) -> list[OcorrenciaPayload]:
    """Cache-aside:
    1. redis.mget_nonatomic das chaves (chaves em slots diferentes)
    2. para as células sem cache: UMA query no banco com status='ativa' AND expira_em > now()
       AND left(geohash, 5) = ANY($1); agrupa por célula (célula sem ocorrência = lista vazia,
       também cacheada)
    3. grava cada célula que faltava com SET ex=CACHE_TTL_S (pipeline do cluster)
    Qualquer erro do Redis (redis.exceptions.RedisError) → loga warning e usa só o banco.
    Mesma forma de ler lat/lon que o processor: ST_Y/ST_X(geom::geometry).
    """
    raise NotImplementedError  # TODO(worker)


def filtrar(
    ocorrencias: list[OcorrenciaPayload],
    min_lon: float,
    min_lat: float,
    max_lon: float,
    max_lat: float,
    tipo: TipoRisco | None,
) -> list[OcorrenciaPayload]:
    """Só as que estão dentro do bbox (bordas inclusas) e do tipo, se informado.
    Ordem: severidade decrescente (critico primeiro), depois atualizada_em decrescente."""
    raise NotImplementedError  # TODO(worker)


async def buscar_ocorrencia(pool: asyncpg.Pool, ocorrencia_id: int) -> OcorrenciaPayload | None:
    """Qualquer status. Direto no banco (sem cache)."""
    raise NotImplementedError  # TODO(worker)
