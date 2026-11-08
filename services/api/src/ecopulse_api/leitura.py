"""Leitura de ocorrências com cache-aside no Redis Cluster (ver ADR 0005).

Cache por célula geohash5: a chave usa hash tag ({...}), então cada célula vai para um slot
e as células se espalham pelos 3 nós do cluster. Valor = JSON com a lista de ocorrências
ATIVAS cujo geohash começa com a célula. TTL curto + invalidação por evento.
Se o Redis falhar, a leitura cai direto no banco (log de warning) — o cache nunca derruba a API.
"""

import json
import logging
import math
from uuid import UUID

import asyncpg
from redis.asyncio.cluster import RedisCluster
from redis.exceptions import RedisError

from ecopulse_api.schemas import CelulaAmbiente, OcorrenciaDetalhe, SituacaoRelato
from ecopulse_common import geohash
from ecopulse_common.events import LeituraAmbiente, OcorrenciaPayload, Severidade, TipoRisco

log = logging.getLogger(__name__)

CACHE_TTL_S = 30
MAX_CELULAS = 64

_ORDEM_SEVERIDADE: dict[Severidade, int] = {
    Severidade.BAIXO: 0,
    Severidade.MODERADO: 1,
    Severidade.ALTO: 2,
    Severidade.CRITICO: 3,
}


def chave_celula(geohash5: str) -> str:
    return f"cell:{{{geohash5}}}:ocorrencias"


def celulas_do_bbox(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> list[str]:
    """Células geohash precisão PARTITION_PRECISION (5) que cobrem o bbox, sem repetição.

    Percorre uma grade com passo menor que a célula (use geohash.decode_bbox de uma célula
    para obter largura/altura) incluindo as bordas. ValueError se min > max, coordenadas fora
    do intervalo, ou se precisar de mais de MAX_CELULAS (o app deve aproximar o zoom).
    Bbox que cruza o antimeridiano não é suportado (ValueError).
    """
    coordenadas = (min_lon, min_lat, max_lon, max_lat)
    if not all(math.isfinite(valor) for valor in coordenadas):
        raise ValueError("coordenadas devem ser finitas")
    if not -180.0 <= min_lon <= 180.0 or not -180.0 <= max_lon <= 180.0:
        raise ValueError("longitude fora de [-180, 180]")
    if not -90.0 <= min_lat <= 90.0 or not -90.0 <= max_lat <= 90.0:
        raise ValueError("latitude fora de [-90, 90]")
    if min_lon > max_lon:
        raise ValueError("longitude mínima maior que a máxima (antimeridiano não suportado)")
    if min_lat > max_lat:
        raise ValueError("latitude mínima maior que a máxima")

    lat_min_celula, lon_min_celula, lat_max_celula, lon_max_celula = geohash.decode_bbox(
        geohash.encode(0.0, 0.0, geohash.PARTITION_PRECISION)
    )
    largura = lon_max_celula - lon_min_celula
    altura = lat_max_celula - lat_min_celula
    total_lon = round(360.0 / largura)
    total_lat = round(180.0 / altura)

    # Índices das células que têm interseção de área com o bbox. A borda máxima é tratada
    # como aberta para não incluir a célula seguinte quando o bbox termina exatamente nela.
    i0 = math.floor((min_lon + 180.0) / largura)
    i1 = math.ceil((max_lon + 180.0) / largura) - 1
    j0 = math.floor((min_lat + 90.0) / altura)
    j1 = math.ceil((max_lat + 90.0) / altura) - 1
    if i1 < i0:
        i1 = i0
    if j1 < j0:
        j1 = j0
    i0 = min(max(i0, 0), total_lon - 1)
    i1 = min(max(i1, 0), total_lon - 1)
    j0 = min(max(j0, 0), total_lat - 1)
    j1 = min(max(j1, 0), total_lat - 1)

    n_lon = i1 - i0 + 1
    n_lat = j1 - j0 + 1
    if n_lon * n_lat > MAX_CELULAS:
        raise ValueError(f"bbox cobre {n_lon * n_lat} células, acima do máximo de {MAX_CELULAS}")

    celulas: list[str] = []
    for j in range(j0, j1 + 1):
        lat = -90.0 + (j + 0.5) * altura
        for i in range(i0, i1 + 1):
            lon = -180.0 + (i + 0.5) * largura
            celulas.append(geohash.encode(lat, lon, geohash.PARTITION_PRECISION))
    return celulas


def _ocorrencia_da_linha(linha: asyncpg.Record) -> OcorrenciaPayload:
    return OcorrenciaPayload(
        id=linha["id"],
        tipo=linha["tipo"],
        severidade=linha["severidade"],
        latitude=linha["latitude"],
        longitude=linha["longitude"],
        geohash=linha["geohash"],
        confirmacoes=linha["confirmacoes"],
        status=linha["status"],
        criada_em=linha["criada_em"],
        atualizada_em=linha["atualizada_em"],
        expira_em=linha["expira_em"],
    )


async def _ocorrencias_ativas(pool: asyncpg.Pool, celulas: list[str]) -> list[OcorrenciaPayload]:
    async with pool.acquire() as conn:
        linhas = await conn.fetch(
            """
            SELECT
                id, tipo, severidade,
                ST_Y(geom::geometry) AS latitude,
                ST_X(geom::geometry) AS longitude,
                geohash, confirmacoes, status, criada_em, atualizada_em, expira_em
            FROM ocorrencias
            WHERE status = 'ativa'
              AND expira_em > now()
              AND left(geohash, 5) = ANY($1)
            """,
            celulas,
        )
    return [_ocorrencia_da_linha(linha) for linha in linhas]


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
    celulas = list(dict.fromkeys(celulas))
    if not celulas:
        return []

    chaves = [chave_celula(celula) for celula in celulas]
    valores: list[str | None] = [None] * len(celulas)
    cache_disponivel = True
    try:
        valores = list(await redis.mget_nonatomic(chaves))
    except RedisError:
        cache_disponivel = False
        log.warning("cache de ocorrências indisponível; lendo do banco")

    faltantes = [celula for celula, valor in zip(celulas, valores, strict=True) if valor is None]
    por_celula: dict[str, list[OcorrenciaPayload]] = {celula: [] for celula in faltantes}
    if faltantes:
        for ocorrencia in await _ocorrencias_ativas(pool, faltantes):
            por_celula.setdefault(ocorrencia.geohash[:5], []).append(ocorrencia)

        if cache_disponivel:
            try:
                pipeline = redis.pipeline()
                for celula in faltantes:
                    lista = [item.model_dump(mode="json") for item in por_celula[celula]]
                    pipeline.set(chave_celula(celula), json.dumps(lista), ex=CACHE_TTL_S)
                await pipeline.execute()
            except RedisError:
                log.warning("falha ao gravar o cache de ocorrências; seguindo com o banco")

    resultado: list[OcorrenciaPayload] = []
    for celula, valor in zip(celulas, valores, strict=True):
        if valor is None:
            resultado.extend(por_celula[celula])
        else:
            resultado.extend(OcorrenciaPayload.model_validate(item) for item in json.loads(valor))
    return resultado


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
    dentro = [
        ocorrencia
        for ocorrencia in ocorrencias
        if min_lon <= ocorrencia.longitude <= max_lon
        and min_lat <= ocorrencia.latitude <= max_lat
        and (tipo is None or ocorrencia.tipo == tipo)
    ]
    dentro.sort(key=lambda ocorrencia: ocorrencia.atualizada_em, reverse=True)
    dentro.sort(key=lambda ocorrencia: _ORDEM_SEVERIDADE[ocorrencia.severidade], reverse=True)
    return dentro


async def buscar_ocorrencia(pool: asyncpg.Pool, ocorrencia_id: int) -> OcorrenciaPayload | None:
    """Qualquer status. Direto no banco (sem cache)."""
    async with pool.acquire() as conn:
        linha = await conn.fetchrow(
            """
            SELECT
                id, tipo, severidade,
                ST_Y(geom::geometry) AS latitude,
                ST_X(geom::geometry) AS longitude,
                geohash, confirmacoes, status, criada_em, atualizada_em, expira_em
            FROM ocorrencias
            WHERE id = $1
            """,
            ocorrencia_id,
        )
    return _ocorrencia_da_linha(linha) if linha is not None else None


async def buscar_situacao_relato(pool: asyncpg.Pool, client_id: UUID) -> SituacaoRelato | None:
    """Relato do próprio aparelho e a ocorrência em que entrou (LEFT JOIN: pode ainda não ter
    ocorrência, mesmo já gravado). None = o processor ainda não gravou o relato."""
    async with pool.acquire() as conn:
        linha = await conn.fetchrow(
            """
            SELECT
                r.client_id, r.ocorrencia_id,
                o.status AS status_ocorrencia,
                o.confirmacoes
            FROM relatos r
            LEFT JOIN ocorrencias o ON o.id = r.ocorrencia_id
            WHERE r.client_id = $1
            """,
            client_id,
        )
    if linha is None:
        return None
    return SituacaoRelato(
        client_id=linha["client_id"],
        ocorrencia_id=linha["ocorrencia_id"],
        status_ocorrencia=linha["status_ocorrencia"],
        confirmacoes=linha["confirmacoes"],
    )


LIMITE_LINHA_DO_TEMPO = 30


async def detalhar_ocorrencia(pool: asyncpg.Pool, ocorrencia_id: int) -> OcorrenciaDetalhe | None:
    """Ocorrência + linha do tempo (últimos LIMITE_LINHA_DO_TEMPO relatos) e nota mais recente."""
    ocorrencia = await buscar_ocorrencia(pool, ocorrencia_id)
    if ocorrencia is None:
        return None
    async with pool.acquire() as conn:
        momentos = await conn.fetch(
            """
            SELECT recebido_em FROM (
                SELECT recebido_em FROM relatos WHERE ocorrencia_id = $1
                ORDER BY recebido_em DESC LIMIT $2
            ) ultimos ORDER BY recebido_em
            """,
            ocorrencia_id,
            LIMITE_LINHA_DO_TEMPO,
        )
        nota = await conn.fetchval(
            """
            SELECT descricao FROM relatos
            WHERE ocorrencia_id = $1 AND descricao IS NOT NULL AND descricao <> ''
            ORDER BY recebido_em DESC LIMIT 1
            """,
            ocorrencia_id,
        )
    return OcorrenciaDetalhe(
        **ocorrencia.model_dump(),
        linha_do_tempo=[linha["recebido_em"] for linha in momentos],
        nota=nota,
    )


AMBIENTE_TTL_S = 60


def chave_ambiente(geohash5: str) -> str:
    return f"amb:{{{geohash5}}}"


async def ultima_leitura(
    pool: asyncpg.Pool, redis: RedisCluster, geohash5: str
) -> LeituraAmbiente | None:
    """Cache-aside (TTL AMBIENTE_TTL_S) da leitura mais recente da célula; RedisError → só banco.
    SELECT leitura FROM leituras_ambiente WHERE geohash=$1 ORDER BY medido_em DESC LIMIT 1."""
    chave = chave_ambiente(geohash5)
    cache: str | None = None
    cache_disponivel = True
    try:
        cache_bruto = await redis.get(chave)
    except RedisError:
        cache_disponivel = False
        log.warning("cache de ambiente indisponível; lendo do banco")
    else:
        if cache_bruto is not None:
            cache = cache_bruto.decode() if isinstance(cache_bruto, bytes) else cache_bruto

    if cache is not None:
        return LeituraAmbiente.model_validate_json(cache)

    async with pool.acquire() as conn:
        valor: str | None = await conn.fetchval(
            """
            SELECT leitura FROM leituras_ambiente
            WHERE geohash = $1
            ORDER BY medido_em DESC
            LIMIT 1
            """,
            geohash5,
        )
    if valor is None:
        return None

    leitura = LeituraAmbiente.model_validate_json(valor)
    if cache_disponivel:
        try:
            await redis.set(chave, leitura.model_dump_json(), ex=AMBIENTE_TTL_S)
        except RedisError:
            log.warning("falha ao gravar o cache de ambiente; seguindo com o banco")
    return leitura


async def leituras_das_celulas(
    pool: asyncpg.Pool, redis: RedisCluster, celulas: list[str]
) -> list[CelulaAmbiente]:
    """Uma `CelulaAmbiente` por célula que já tem leitura; células sem leitura ficam de fora.
    Cada consulta passa pelo cache-aside de `ultima_leitura`."""
    resultado: list[CelulaAmbiente] = []
    for celula in celulas:
        leitura = await ultima_leitura(pool, redis, celula)
        if leitura is None:
            continue
        lat_min, lon_min, lat_max, lon_max = geohash.decode_bbox(celula)
        resultado.append(
            CelulaAmbiente(
                geohash=celula,
                lat_min=lat_min,
                lon_min=lon_min,
                lat_max=lat_max,
                lon_max=lon_max,
                temperatura=leitura.temperatura,
                aqi=leitura.aqi,
                medido_em=leitura.medido_em,
            )
        )
    return resultado
