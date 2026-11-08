"""Rota segura: desvia das ocorrências ativas com OpenRouteService (`avoid_polygons`).

Fluxo:
1. Busca as ocorrências ativas no retângulo origem–destino expandido em 1 km (PostGIS).
2. Converte cada ocorrência moderada/alta/crítica em um círculo de 16 lados (lon/lat) com
   raio conforme a severidade. Zonas que contêm a origem ou o destino ficam fora do avoid
   (o ORS não conseguiria rotear de/para dentro delas) e viram aviso.
3. Faz duas chamadas ao ORS em paralelo: com `avoid_polygons` (segura) e sem (direta).
4. Compara as rotas: `evitadas` são as zonas que a direta cruza e a segura não.
5. Cache no Redis Cluster por (modo, geohash7 da origem, geohash7 do destino, ids das zonas).

Sem ocorrências que valham desvio, uma única chamada resolve (a rota já é a direta).
Erros do ORS nunca vazam a chave: ela só aparece no header Authorization do request.
"""

import asyncio
import logging
import math
from collections.abc import AsyncIterator
from dataclasses import dataclass
from itertools import pairwise
from typing import Any, cast

import asyncpg
import httpx
from pydantic import ValidationError
from redis.asyncio.cluster import RedisCluster
from redis.exceptions import RedisError

from ecopulse_api.schemas import ModoRota, OcorrenciaEvitada, RotaDireta, RotaSegura
from ecopulse_common import geohash
from ecopulse_common.config import Settings
from ecopulse_common.events import OcorrenciaPayload, Severidade

log = logging.getLogger(__name__)

Coordenada = tuple[float, float]  # (lat, lon)

PERFIS: dict[ModoRota, str] = {
    "pedestre": "foot-walking",
    "carro": "driving-car",
}

RAIO_POR_SEVERIDADE: dict[Severidade, float] = {
    Severidade.BAIXO: 0.0,
    Severidade.MODERADO: 150.0,
    Severidade.ALTO: 250.0,
    Severidade.CRITICO: 400.0,
}

DISTANCIA_MAXIMA_M = 50_000.0
EXPANSAO_RETANGULO_M = 1_000.0
TIMEOUT_S = 10.0
CACHE_TTL_S = 300
PRECISAO_CACHE = 7
POLIGONO_LADOS = 16
RAIO_TERRA_M = 6_371_008.8

AVISO_ORIGEM = "Origem dentro de uma área de risco"
AVISO_DESTINO = "Destino dentro de uma área de risco"
AVISO_SEM_ROTA = "Não há caminho que evite todos os riscos"


class CoordenadaInvalida(ValueError):
    """Origem/destino não é "lat,lon" válido."""


class DistanciaGrandeDemais(ValueError):
    """Origem e destino estão a mais de DISTANCIA_MAXIMA_M."""


class OrsNaoConfigurado(Exception):
    """Não há chave do ORS configurada."""


class OrsIndisponivel(Exception):
    """ORS fora do ar, timeout, erro 5xx ou resposta inesperada."""


class SemRota(Exception):
    """O ORS não encontrou rota (ex.: avoid_polygons fecharam todos os caminhos)."""


def obter_settings() -> Settings:
    """Dependência do FastAPI; testes podem sobrescrever com app.dependency_overrides."""
    return Settings()


async def obter_cliente_ors() -> AsyncIterator[httpx.AsyncClient]:
    """Cliente HTTP do ORS; a integração injeta um MockTransport por override."""
    async with httpx.AsyncClient(timeout=TIMEOUT_S) as cliente:
        yield cliente


def parse_coordenada(texto: str) -> Coordenada:
    """Converte "lat,lon" em (lat, lon). ValueError se mal formada ou fora do intervalo."""
    partes = texto.split(",")
    if len(partes) != 2:
        raise CoordenadaInvalida("coordenada deve ser lat,lon")
    try:
        latitude = float(partes[0])
        longitude = float(partes[1])
    except ValueError as exc:
        raise CoordenadaInvalida("coordenada deve ser lat,lon") from exc
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        raise CoordenadaInvalida("coordenada deve ser finita")
    if not -90.0 <= latitude <= 90.0:
        raise CoordenadaInvalida("latitude fora de [-90, 90]")
    if not -180.0 <= longitude <= 180.0:
        raise CoordenadaInvalida("longitude fora de [-180, 180]")
    return latitude, longitude


def distancia_metros(a: Coordenada, b: Coordenada) -> float:
    """Distância haversine entre dois pontos em metros."""
    lat1 = math.radians(a[0])
    lat2 = math.radians(b[0])
    delta_lat = math.radians(b[0] - a[0])
    delta_lon = math.radians(b[1] - a[1])
    h = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lon / 2) ** 2
    )
    return 2 * RAIO_TERRA_M * math.asin(math.sqrt(min(1.0, h)))


def validar_distancia(origem: Coordenada, destino: Coordenada) -> None:
    if distancia_metros(origem, destino) > DISTANCIA_MAXIMA_M:
        raise DistanciaGrandeDemais("distância grande demais")


def _destino(centro: Coordenada, distancia_m: float, rumo_rad: float) -> Coordenada:
    """Ponto a `distancia_m` do centro no rumo dado (fórmula do ponto de destino)."""
    lat1 = math.radians(centro[0])
    lon1 = math.radians(centro[1])
    d = distancia_m / RAIO_TERRA_M
    lat2 = math.asin(
        math.sin(lat1) * math.cos(d) + math.cos(lat1) * math.sin(d) * math.cos(rumo_rad)
    )
    lon2 = lon1 + math.atan2(
        math.sin(rumo_rad) * math.sin(d) * math.cos(lat1),
        math.cos(d) - math.sin(lat1) * math.sin(lat2),
    )
    longitude = (math.degrees(lon2) + 540.0) % 360.0 - 180.0
    return math.degrees(lat2), longitude


def poligono_circulo(centro: Coordenada, raio_m: float) -> list[list[float]]:
    """Anel GeoJSON [lon, lat] de um círculo de 16 lados, fechado e em sentido anti-horário
    (regra da mão direita do GeoJSON, exigida pelo ORS)."""
    anel: list[list[float]] = []
    for indice in range(POLIGONO_LADOS):
        rumo = 2.0 * math.pi * indice / POLIGONO_LADOS
        latitude, longitude = _destino(centro, raio_m, rumo)
        anel.append([longitude, latitude])
    anel.append(list(anel[0]))
    return anel


def _avoid_polygons(ocorrencias: list[OcorrenciaPayload]) -> dict[str, Any]:
    return {
        "type": "MultiPolygon",
        "coordinates": [
            [
                poligono_circulo(
                    (item.latitude, item.longitude), RAIO_POR_SEVERIDADE[item.severidade]
                )
            ]
            for item in ocorrencias
        ],
    }


def _zona_contem(centro: Coordenada, raio_m: float, ponto: Coordenada) -> bool:
    return distancia_metros(centro, ponto) <= raio_m


def _distancia_ponto_segmento(ponto: Coordenada, inicio: Coordenada, fim: Coordenada) -> float:
    """Distância (m) do ponto ao segmento, numa projeção local equiretangular centrada nele."""
    cos_lat = math.cos(math.radians(ponto[0]))

    def projetar(coordenada: Coordenada) -> tuple[float, float]:
        x = math.radians(coordenada[1] - ponto[1]) * cos_lat * RAIO_TERRA_M
        y = math.radians(coordenada[0] - ponto[0]) * RAIO_TERRA_M
        return x, y

    ax, ay = projetar(inicio)
    bx, by = projetar(fim)
    dx = bx - ax
    dy = by - ay
    comprimento2 = dx * dx + dy * dy
    if comprimento2 == 0.0:
        return math.hypot(ax, ay)
    t = -(ax * dx + ay * dy) / comprimento2
    t = max(0.0, min(1.0, t))
    return math.hypot(ax + t * dx, ay + t * dy)


def _rota_atravessa(coordenadas: list[Coordenada], centro: Coordenada, raio_m: float) -> bool:
    """True se algum ponto da linha chega a menos do raio do centro da zona."""
    if not coordenadas:
        return False
    if len(coordenadas) == 1:
        return distancia_metros(coordenadas[0], centro) < raio_m
    return any(
        _distancia_ponto_segmento(centro, inicio, fim) < raio_m
        for inicio, fim in pairwise(coordenadas)
    )


def _ids_atravessados(coordenadas: list[Coordenada], zonas: list[OcorrenciaPayload]) -> list[int]:
    return sorted(
        zona.id
        for zona in zonas
        if _rota_atravessa(
            coordenadas,
            (zona.latitude, zona.longitude),
            RAIO_POR_SEVERIDADE[zona.severidade],
        )
    )


def _resumo(zona: OcorrenciaPayload) -> OcorrenciaEvitada:
    return OcorrenciaEvitada(
        id=zona.id,
        tipo=zona.tipo,
        severidade=zona.severidade,
        latitude=zona.latitude,
        longitude=zona.longitude,
    )


def _no_caminho(
    coordenadas: list[Coordenada], zonas: list[OcorrenciaPayload]
) -> list[OcorrenciaEvitada]:
    ids = set(_ids_atravessados(coordenadas, zonas))
    return [_resumo(zona) for zona in zonas if zona.id in ids]


def chave_cache(
    modo: ModoRota,
    origem: Coordenada,
    destino: Coordenada,
    ids_zonas: list[int],
) -> str:
    geohash_origem = geohash.encode(origem[0], origem[1], PRECISAO_CACHE)
    geohash_destino = geohash.encode(destino[0], destino[1], PRECISAO_CACHE)
    ids = ",".join(str(item) for item in sorted(ids_zonas))
    return f"rota:{{{modo}:{geohash_origem}:{geohash_destino}:{ids}}}"


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


async def ocorrencias_ativas(
    pool: asyncpg.Pool, origem: Coordenada, destino: Coordenada
) -> list[OcorrenciaPayload]:
    """Ocorrências ativas no retângulo origem–destino expandido em EXPANSAO_RETANGULO_M."""
    min_lon = min(origem[1], destino[1])
    min_lat = min(origem[0], destino[0])
    max_lon = max(origem[1], destino[1])
    max_lat = max(origem[0], destino[0])
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
              AND ST_DWithin(
                    geom,
                    ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography,
                    $5
                  )
            """,
            min_lon,
            min_lat,
            max_lon,
            max_lat,
            EXPANSAO_RETANGULO_M,
        )
    return [_ocorrencia_da_linha(linha) for linha in linhas]


@dataclass(frozen=True)
class RotaOrs:
    distancia_m: float
    duracao_s: float
    coordenadas: list[Coordenada]


def _objeto(valor: Any, nome: str) -> dict[str, Any]:
    if not isinstance(valor, dict):
        raise OrsIndisponivel(f"resposta do ORS inválida: {nome}")
    return cast(dict[str, Any], valor)


def _lista(valor: Any, nome: str) -> list[Any]:
    if not isinstance(valor, list):
        raise OrsIndisponivel(f"resposta do ORS inválida: {nome}")
    return valor


def _parse_rota(dados: Any) -> RotaOrs:
    resposta = _objeto(dados, "resposta")
    features = _lista(resposta.get("features"), "features")
    if not features:
        raise SemRota
    feature = _objeto(features[0], "features[0]")
    propriedades = _objeto(feature.get("properties"), "properties")
    resumo = _objeto(propriedades.get("summary"), "summary")
    geometria = _objeto(feature.get("geometry"), "geometry")
    pontos = _lista(geometria.get("coordinates"), "geometry.coordinates")

    try:
        distancia = float(resumo["distance"])
        duracao = float(resumo["duration"])
        coordenadas: list[Coordenada] = []
        for ponto in pontos:
            par = _lista(ponto, "coordenada")
            if len(par) < 2:
                raise ValueError("coordenada sem par lon/lat")
            coordenadas.append((float(par[1]), float(par[0])))
    except (KeyError, TypeError, ValueError) as exc:
        raise OrsIndisponivel(f"resposta do ORS inválida: {exc}") from exc

    if not coordenadas:
        raise SemRota
    return RotaOrs(distancia_m=distancia, duracao_s=duracao, coordenadas=coordenadas)


def _codigo_erro(resposta: httpx.Response) -> int | None:
    try:
        dados = resposta.json()
    except ValueError:
        return None
    if not isinstance(dados, dict):
        return None
    erro = dados.get("error")
    if not isinstance(erro, dict):
        return None
    codigo = erro.get("code")
    return codigo if isinstance(codigo, int) else None


async def _chamar_ors(
    cliente: httpx.AsyncClient,
    *,
    base_url: str,
    perfil: str,
    chave: str,
    origem: Coordenada,
    destino: Coordenada,
    avoid_polygons: dict[str, Any] | None,
) -> RotaOrs:
    corpo: dict[str, Any] = {
        "coordinates": [
            [origem[1], origem[0]],
            [destino[1], destino[0]],
        ]
    }
    if avoid_polygons is not None:
        corpo["options"] = {"avoid_polygons": avoid_polygons}

    url = f"{base_url.rstrip('/')}/v2/directions/{perfil}/geojson"
    try:
        resposta = await cliente.post(
            url,
            json=corpo,
            headers={"Authorization": chave},
            timeout=TIMEOUT_S,
        )
    except httpx.TimeoutException as exc:
        raise OrsIndisponivel("ORS não respondeu a tempo") from exc
    except httpx.HTTPError as exc:
        raise OrsIndisponivel("falha de rede ao chamar o ORS") from exc

    if resposta.status_code == 404:
        raise SemRota
    if resposta.status_code >= 500:
        raise OrsIndisponivel(f"ORS respondeu {resposta.status_code}")
    if resposta.status_code >= 400:
        if _codigo_erro(resposta) in {2009, 2010}:
            raise SemRota
        raise OrsIndisponivel(f"ORS respondeu {resposta.status_code}")

    try:
        dados = resposta.json()
    except ValueError as exc:
        raise OrsIndisponivel("resposta do ORS não é JSON") from exc
    return _parse_rota(dados)


def _juntar_avisos(avisos: list[str], extra: str | None = None) -> str | None:
    todos = [*avisos, extra] if extra is not None else avisos
    return "; ".join(todos) if todos else None


async def _ler_cache(redis: RedisCluster, chave: str) -> RotaSegura | None:
    try:
        valor = await redis.get(chave)
    except RedisError:
        log.warning("cache de rotas indisponível; consultando o ORS")
        return None
    if valor is None:
        return None
    try:
        return RotaSegura.model_validate_json(valor)
    except ValidationError:
        # formato antigo (deploy novo com cache de até 5 min): recalcula
        return None


async def _gravar_cache(redis: RedisCluster, chave: str, resultado: RotaSegura) -> None:
    try:
        await redis.set(chave, resultado.model_dump_json(), ex=CACHE_TTL_S)
    except RedisError:
        log.warning("falha ao gravar o cache de rotas")


async def _calcular(
    cliente: httpx.AsyncClient,
    *,
    base_url: str,
    chave: str,
    origem: Coordenada,
    destino: Coordenada,
    modo: ModoRota,
    zonas: list[OcorrenciaPayload],
) -> RotaSegura:
    perfil = PERFIS[modo]
    origem_dentro = any(
        _zona_contem((zona.latitude, zona.longitude), RAIO_POR_SEVERIDADE[zona.severidade], origem)
        for zona in zonas
    )
    destino_dentro = any(
        _zona_contem((zona.latitude, zona.longitude), RAIO_POR_SEVERIDADE[zona.severidade], destino)
        for zona in zonas
    )
    avisos: list[str] = []
    if origem_dentro:
        avisos.append(AVISO_ORIGEM)
    if destino_dentro:
        avisos.append(AVISO_DESTINO)

    contidas = {
        zona.id
        for zona in zonas
        if _zona_contem(
            (zona.latitude, zona.longitude), RAIO_POR_SEVERIDADE[zona.severidade], origem
        )
        or _zona_contem(
            (zona.latitude, zona.longitude), RAIO_POR_SEVERIDADE[zona.severidade], destino
        )
    }
    zonas_avoid = [zona for zona in zonas if zona.id not in contidas]

    if not zonas_avoid:
        rota = await _chamar_ors(
            cliente,
            base_url=base_url,
            perfil=perfil,
            chave=chave,
            origem=origem,
            destino=destino,
            avoid_polygons=None,
        )
        return RotaSegura(
            modo=modo,
            distancia_m=rota.distancia_m,
            duracao_s=rota.duracao_s,
            coordenadas=rota.coordenadas,
            evitadas=[],
            no_caminho=_no_caminho(rota.coordenadas, zonas),
            sem_desvio=False,
            direta=None,
            aviso=_juntar_avisos(avisos),
        )

    segura, direta = await asyncio.gather(
        _chamar_ors(
            cliente,
            base_url=base_url,
            perfil=perfil,
            chave=chave,
            origem=origem,
            destino=destino,
            avoid_polygons=_avoid_polygons(zonas_avoid),
        ),
        _chamar_ors(
            cliente,
            base_url=base_url,
            perfil=perfil,
            chave=chave,
            origem=origem,
            destino=destino,
            avoid_polygons=None,
        ),
        return_exceptions=True,
    )

    if isinstance(segura, BaseException):
        if isinstance(segura, SemRota) and not isinstance(direta, BaseException):
            atravessa = _ids_atravessados(direta.coordenadas, zonas)
            return RotaSegura(
                modo=modo,
                distancia_m=direta.distancia_m,
                duracao_s=direta.duracao_s,
                coordenadas=direta.coordenadas,
                evitadas=[],
                no_caminho=_no_caminho(direta.coordenadas, zonas),
                sem_desvio=True,
                direta=RotaDireta(
                    distancia_m=direta.distancia_m,
                    duracao_s=direta.duracao_s,
                    coordenadas=direta.coordenadas,
                    atravessa=atravessa,
                ),
                aviso=_juntar_avisos(avisos, AVISO_SEM_ROTA),
            )
        raise OrsIndisponivel("ORS não calculou a rota segura") from segura

    if isinstance(direta, BaseException):
        raise OrsIndisponivel("ORS não calculou a rota direta") from direta

    atravessa = _ids_atravessados(direta.coordenadas, zonas)
    atravessadas_pela_segura = set(_ids_atravessados(segura.coordenadas, zonas))
    por_id = {zona.id: zona for zona in zonas}
    evitadas = [
        _resumo(por_id[zona_id]) for zona_id in atravessa if zona_id not in atravessadas_pela_segura
    ]

    return RotaSegura(
        modo=modo,
        distancia_m=segura.distancia_m,
        duracao_s=segura.duracao_s,
        coordenadas=segura.coordenadas,
        evitadas=evitadas,
        no_caminho=[_resumo(por_id[zona_id]) for zona_id in sorted(atravessadas_pela_segura)],
        sem_desvio=False,
        direta=RotaDireta(
            distancia_m=direta.distancia_m,
            duracao_s=direta.duracao_s,
            coordenadas=direta.coordenadas,
            atravessa=atravessa,
        ),
        aviso=_juntar_avisos(avisos),
    )


async def rota_segura(
    pool: asyncpg.Pool,
    redis: RedisCluster,
    cliente: httpx.AsyncClient,
    origem: Coordenada,
    destino: Coordenada,
    modo: ModoRota,
    *,
    chave: str,
    base_url: str,
) -> RotaSegura:
    """Calcula (ou lê do cache) a rota segura entre origem e destino."""
    if not chave:
        raise OrsNaoConfigurado
    validar_distancia(origem, destino)

    ocorrencias = await ocorrencias_ativas(pool, origem, destino)
    zonas = [item for item in ocorrencias if RAIO_POR_SEVERIDADE[item.severidade] > 0]
    chave_redis = chave_cache(modo, origem, destino, [zona.id for zona in zonas])

    em_cache = await _ler_cache(redis, chave_redis)
    if em_cache is not None:
        return em_cache

    resultado = await _calcular(
        cliente,
        base_url=base_url,
        chave=chave,
        origem=origem,
        destino=destino,
        modo=modo,
        zonas=zonas,
    )
    await _gravar_cache(redis, chave_redis, resultado)
    return resultado
