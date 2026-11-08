import json
from typing import Any, cast

import asyncpg
import httpx
import pytest
from fastapi.testclient import TestClient
from redis.asyncio.cluster import RedisCluster

from ecopulse_api import main, rotas
from ecopulse_common import geohash
from ecopulse_common.config import Settings
from ecopulse_common.events import Severidade, TipoRisco

pytestmark = pytest.mark.integration

ORIGEM = "0,0"
DESTINO = "0,0.02"
CHAVE = "chave-de-teste"

DIRETA_LONLAT = [[0.0, 0.0], [0.02, 0.0]]
SEGURA_LONLAT = [[0.0, 0.0], [0.005, 0.01], [0.015, 0.01], [0.02, 0.0]]
SEGURA_LATLON = [[0.0, 0.0], [0.01, 0.005], [0.01, 0.015], [0.0, 0.02]]


def _rota_json(coordenadas: list[list[float]], distancia: float, duracao: float) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"summary": {"distance": distancia, "duration": duracao}},
                "geometry": {"type": "LineString", "coordinates": coordenadas},
            }
        ],
    }


async def _inserir(
    pool: asyncpg.Pool,
    *,
    tipo: TipoRisco,
    severidade: Severidade,
    latitude: float,
    longitude: float,
) -> int:
    codigo = geohash.encode(latitude, longitude, geohash.CELL_PRECISION)
    async with pool.acquire() as conn:
        ocorrencia_id = await conn.fetchval(
            """
            INSERT INTO ocorrencias (
                tipo, severidade, geom, geohash, confirmacoes, status, expira_em
            )
            VALUES (
                $1, $2,
                ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
                $5, 1, 'ativa', now() + interval '1 hour'
            )
            RETURNING id
            """,
            tipo.value,
            severidade.value,
            latitude,
            longitude,
            codigo,
        )
    assert ocorrencia_id is not None
    return int(ocorrencia_id)


async def _limpar_cache(redis: RedisCluster) -> None:
    chaves = [chave async for chave in redis.scan_iter(match="rota:*")]
    if chaves:
        await redis.delete(*chaves)


async def test_endpoint_rota_segura_com_banco_real_e_ors_mockado(
    cliente: TestClient, pool: asyncpg.Pool, redis: RedisCluster
) -> None:
    await _limpar_cache(redis)
    alto = await _inserir(
        pool,
        tipo=TipoRisco.ALAGAMENTO,
        severidade=Severidade.ALTO,
        latitude=0.0,
        longitude=0.009,
    )
    critico = await _inserir(
        pool,
        tipo=TipoRisco.ROTA_OBSTRUIDA,
        severidade=Severidade.CRITICO,
        latitude=0.0,
        longitude=0.011,
    )

    chamadas: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == CHAVE
        corpo = cast(dict[str, Any], json.loads(request.content))
        chamadas.append(corpo)
        if "options" in corpo:
            return httpx.Response(200, json=_rota_json(SEGURA_LONLAT, 3000.0, 600.0))
        return httpx.Response(200, json=_rota_json(DIRETA_LONLAT, 2224.0, 300.0))

    cliente_ors = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    main.app.dependency_overrides[rotas.obter_cliente_ors] = lambda: cliente_ors
    main.app.dependency_overrides[rotas.obter_settings] = lambda: Settings(ors_api_key=CHAVE)
    try:
        resposta = cliente.get(
            "/v1/rotas",
            params={"origem": ORIGEM, "destino": DESTINO, "modo": "pedestre"},
        )

        assert resposta.status_code == 200
        dados = resposta.json()
        assert dados["modo"] == "pedestre"
        assert dados["distancia_m"] == pytest.approx(3000.0)
        assert dados["coordenadas"] == SEGURA_LATLON
        assert [item["id"] for item in dados["evitadas"]] == sorted([alto, critico])
        assert dados["direta"]["atravessa"] == sorted([alto, critico])
        assert dados["aviso"] is None
        assert CHAVE not in resposta.text
        assert len(chamadas) == 2

        com_avoid = next(corpo for corpo in chamadas if "options" in corpo)
        assert len(com_avoid["options"]["avoid_polygons"]["coordinates"]) == 2

        segunda = cliente.get(
            "/v1/rotas",
            params={"origem": ORIGEM, "destino": DESTINO, "modo": "pedestre"},
        )
        assert segunda.status_code == 200
        assert len(chamadas) == 2
    finally:
        main.app.dependency_overrides.clear()
        await cliente_ors.aclose()
        await _limpar_cache(redis)
