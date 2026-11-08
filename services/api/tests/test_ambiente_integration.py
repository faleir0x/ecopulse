from datetime import UTC, datetime

import asyncpg
import pytest
from fastapi.testclient import TestClient
from redis.asyncio.cluster import RedisCluster

from ecopulse_api import leitura
from ecopulse_common import ambiente, geohash
from ecopulse_common.events import LeituraAmbiente

pytestmark = pytest.mark.integration

LATITUDE = 38.72
LONGITUDE = -9.14
CELULA = geohash.encode(LATITUDE, LONGITUDE, geohash.PARTITION_PRECISION)


def _leitura() -> LeituraAmbiente:
    return LeituraAmbiente(
        geohash=CELULA,
        latitude=LATITUDE,
        longitude=LONGITUDE,
        medido_em=datetime(2026, 11, 8, 12, 0, tzinfo=UTC),
        fonte="simulador",
        temperatura=24.0,
        sensacao=25.0,
        codigo_tempo=2,
        minima_dia=18.0,
        maxima_dia=27.0,
        aqi=35,
        chuva_mm_h=0.0,
        proximas_horas=[],
        chuva_3h=[0.0] * 12,
    )


async def _limpar(pool: asyncpg.Pool, redis: RedisCluster) -> None:
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM leituras_ambiente WHERE geohash = $1", CELULA)
    await redis.delete(leitura.chave_ambiente(CELULA), ambiente.CHAVE_INTERESSE)


async def _inserir(pool: asyncpg.Pool) -> LeituraAmbiente:
    leitura_ambiente = _leitura()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO leituras_ambiente (geohash, medido_em, leitura)
            VALUES ($1, $2, $3)
            """,
            leitura_ambiente.geohash,
            leitura_ambiente.medido_em,
            leitura_ambiente.model_dump_json(),
        )
    return leitura_ambiente


async def _apagar(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM leituras_ambiente WHERE geohash = $1", CELULA)


async def test_ambiente_404_depois_200_e_cache(
    cliente: TestClient, pool: asyncpg.Pool, redis: RedisCluster
) -> None:
    await _limpar(pool, redis)
    try:
        sem_leitura = cliente.get("/v1/ambiente", params={"lat": LATITUDE, "lon": LONGITUDE})

        assert sem_leitura.status_code == 404
        assert sem_leitura.json() == {"detail": "sem leitura"}
        score = await redis.zscore(ambiente.CHAVE_INTERESSE, CELULA)
        assert score is not None

        leitura_ambiente = await _inserir(pool)
        primeira = cliente.get("/v1/ambiente", params={"lat": LATITUDE, "lon": LONGITUDE})

        assert primeira.status_code == 200
        assert primeira.json()["geohash"] == CELULA
        assert primeira.json()["fonte"] == leitura_ambiente.fonte
        assert await redis.exists(leitura.chave_ambiente(CELULA))
        ttl = await redis.ttl(leitura.chave_ambiente(CELULA))
        assert 0 < ttl <= leitura.AMBIENTE_TTL_S

        await _apagar(pool)
        segunda = cliente.get("/v1/ambiente", params={"lat": LATITUDE, "lon": LONGITUDE})

        assert segunda.status_code == 200
        assert segunda.json()["geohash"] == CELULA
    finally:
        await _limpar(pool, redis)


@pytest.mark.parametrize(
    ("latitude", "longitude"),
    [(91.0, 0.0), (-91.0, 0.0), (0.0, 181.0), (0.0, -181.0)],
)
async def test_ambiente_coordenada_invalida(
    cliente: TestClient, redis: RedisCluster, latitude: float, longitude: float
) -> None:
    del redis
    resposta = cliente.get("/v1/ambiente", params={"lat": latitude, "lon": longitude})

    assert resposta.status_code == 422
