"""Busca de bairro/endereço no Brasil para quem está sem GPS (geocodificação do ORS).

O geocodificador do Android não sabe "perto de onde" sem localização e devolve lugares de
outros estados; o do ORS (Pelias) aceita filtro por país e traz rótulos com a cidade.
A chave fica só no servidor; cache de 1 dia no Redis Cluster por texto normalizado.
"""

import logging
from typing import Any

import httpx
from pydantic import TypeAdapter, ValidationError
from redis.asyncio.cluster import RedisCluster
from redis.exceptions import RedisError

from ecopulse_api.schemas import LocalEncontrado

log = logging.getLogger(__name__)

TAMANHO_MINIMO = 3
TAMANHO_MAXIMO = 80
LIMITE_RESULTADOS = 5
CACHE_TTL_S = 24 * 3600
TIMEOUT_S = 6.0
CAMADAS = "neighbourhood,borough,locality,localadmin,street,address,venue"
# Bairro/cidade antes de rua/endereço, e estabelecimentos por último (o ORS mistura tudo)
PRIORIDADE = {
    "neighbourhood": 0,
    "borough": 0,
    "locality": 1,
    "localadmin": 1,
    "street": 2,
    "address": 2,
    "venue": 3,
}

_LISTA = TypeAdapter(list[LocalEncontrado])


class BuscaIndisponivel(Exception):
    """ORS fora do ar, timeout ou resposta inesperada."""


def normalizar(texto: str) -> str:
    return " ".join(texto.split()).lower()


def chave_cache(texto: str, perto: tuple[float, float] | None = None) -> str:
    # perto arredondado a ~10 km: buscas da mesma região dividem o cache
    regiao = f"{perto[0]:.1f},{perto[1]:.1f}" if perto else "-"
    return f"locais:{{{normalizar(texto)}|{regiao}}}"


def _detalhe(nome: str, rotulo: str | None) -> str | None:
    """ "Pinheiros, São Paulo, Brazil" → "São Paulo" (sem repetir o nome nem o país)."""
    if not rotulo:
        return None
    # "Rua Augusta, 304, São Paulo": o nome já tem vírgula, então tira ele inteiro do começo
    if rotulo.startswith(nome):
        rotulo = rotulo[len(nome) :]
    partes = [p.strip() for p in rotulo.split(",")]
    resto = [p for p in partes if p and p != nome and p not in {"Brazil", "Brasil"}]
    return ", ".join(resto) or None


def _parse(dados: Any, texto: str = "") -> list[LocalEncontrado]:
    if not isinstance(dados, dict) or not isinstance(dados.get("features"), list):
        raise BuscaIndisponivel("resposta do ORS inválida")
    locais: list[LocalEncontrado] = []
    vistos: set[str] = set()
    procurado = normalizar(texto)

    def ordem(feature: dict[str, Any]) -> tuple[int, int]:
        props = feature.get("properties") or {}
        # Nome igual ao digitado ("Pinheiros") antes de "Esporte Clube Pinheiros"
        exato = 0 if normalizar(str(props.get("name", ""))) == procurado else 1
        return exato, PRIORIDADE.get(str(props.get("layer")), 3)

    features = sorted((f for f in dados["features"] if isinstance(f, dict)), key=ordem)
    for feature in features:
        try:
            props = feature["properties"]
            lon, lat = feature["geometry"]["coordinates"][:2]
            nome = str(props["name"])
            detalhe = _detalhe(nome, props.get("label"))
            local = LocalEncontrado(
                nome=nome, detalhe=detalhe, latitude=float(lat), longitude=float(lon)
            )
        except (KeyError, TypeError, ValueError, ValidationError):
            continue
        chave = f"{local.nome}|{local.detalhe}"
        if chave in vistos:
            continue
        vistos.add(chave)
        locais.append(local)
        if len(locais) == LIMITE_RESULTADOS:
            break
    return locais


async def buscar(
    redis: RedisCluster,
    cliente: httpx.AsyncClient,
    texto: str,
    *,
    chave: str,
    base_url: str,
    perto: tuple[float, float] | None = None,
) -> list[LocalEncontrado]:
    """Até 5 lugares no Brasil para o texto (≥ 3 letras), priorizando os perto de `perto`
    (lat, lon; ex.: última posição conhecida do aparelho). Usa o cache quando possível."""
    chave_redis = chave_cache(texto, perto)
    try:
        em_cache = await redis.get(chave_redis)
    except RedisError:
        em_cache = None
    if em_cache is not None:
        try:
            return _LISTA.validate_json(em_cache)
        except ValidationError:
            pass

    parametros = {
        "text": texto.strip(),
        "boundary.country": "BR",
        "layers": CAMADAS,
        "size": str(LIMITE_RESULTADOS * 3),
    }
    if perto is not None:
        parametros["focus.point.lat"] = f"{perto[0]:.4f}"
        parametros["focus.point.lon"] = f"{perto[1]:.4f}"
    try:
        resposta = await cliente.get(
            f"{base_url.rstrip('/')}/geocode/autocomplete",
            params=parametros,
            headers={"Authorization": chave},
            timeout=TIMEOUT_S,
        )
    except httpx.HTTPError as exc:
        raise BuscaIndisponivel("falha ao chamar o ORS") from exc
    if resposta.status_code != 200:
        raise BuscaIndisponivel(f"ORS respondeu {resposta.status_code}")
    try:
        locais = _parse(resposta.json(), texto)
    except ValueError as exc:
        raise BuscaIndisponivel("resposta do ORS não é JSON") from exc

    try:
        await redis.set(chave_redis, _LISTA.dump_json(locais), ex=CACHE_TTL_S)
    except RedisError:
        log.warning("falha ao gravar o cache de locais")
    return locais
