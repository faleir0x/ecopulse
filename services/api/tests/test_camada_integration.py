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
CELULA_SEM_LEITURA = geohash.neighbors(CELULA)[2]  # leste, mesma faixa de latitude


def _centro(celula: str) -> tuple[float, float]:
    lat_min, lon_min, lat_max, lon_max = geohash.decode_bbox(celula)
    return (lat_min + lat_max) / 2, (lon_min + lon_max) / 2


def _leitura(celula: str, latitude: float, longitude: float) -> LeituraAmbiente:
    return LeituraAmbiente(
        geohash=celula,
        latitude=latitude,
        longitude=longitude,
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


def _bbox_valores(celulas: list[str]) -> tuple[float, float, float, float]:
    """bbox justo (com folga mínima nas bordas) que cobre exatamente essas células."""
    caixas = [geohash.decode_bbox(celula) for celula in celulas]
    lat_min = min(caixa[0] for caixa in caixas) + 1e-9
    lon_min = min(caixa[1] for caixa in caixas) + 1e-9
    lat_max = max(caixa[2] for caixa in caixas) - 1e-9
    lon_max = max(caixa[3] for caixa in caixas) - 1e-9
    return lon_min, lat_min, lon_max, lat_max


def _bbox(celulas: list[str]) -> str:
    return ",".join(str(valor) for valor in _bbox_valores(celulas))


async def _limpar(pool: asyncpg.Pool, redis: RedisCluster, celulas: list[str]) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM leituras_ambiente WHERE geohash = ANY($1)",
            celulas,
        )
    chaves = [leitura.chave_ambiente(celula) for celula in celulas]
    await redis.delete(*chaves)
    await redis.zrem(ambiente.CHAVE_INTERESSE, *celulas)


async def _inserir(pool: asyncpg.Pool, leitura_ambiente: LeituraAmbiente) -> None:
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


async def test_camada_devolve_so_celulas_com_leitura_e_registra_interesse(
    cliente: TestClient, pool: asyncpg.Pool, redis: RedisCluster
) -> None:
    celulas = [CELULA, CELULA_SEM_LEITURA]
    await _limpar(pool, redis, celulas)
    try:
        latitude, longitude = _centro(CELULA)
        await _inserir(pool, _leitura(CELULA, latitude, longitude))

        resposta = cliente.get("/v1/ambiente/camada", params={"bbox": _bbox(celulas)})

        assert resposta.status_code == 200
        corpo = resposta.json()
        assert [item["geohash"] for item in corpo] == [CELULA]

        item = corpo[0]
        lat_min, lon_min, lat_max, lon_max = geohash.decode_bbox(CELULA)
        assert item["lat_min"] == pytest.approx(lat_min)
        assert item["lon_min"] == pytest.approx(lon_min)
        assert item["lat_max"] == pytest.approx(lat_max)
        assert item["lon_max"] == pytest.approx(lon_max)
        assert item["temperatura"] == 24.0
        assert item["aqi"] == 35
        assert item["medido_em"].startswith("2026-11-08T12:00:00")

        # Interesse em TODAS as células do bbox, inclusive a que ainda não tem leitura.
        for celula in leitura.celulas_do_bbox(*_bbox_valores(celulas)):
            assert await redis.zscore(ambiente.CHAVE_INTERESSE, celula) is not None
    finally:
        await _limpar(pool, redis, celulas)


async def test_camada_sem_leitura_devolve_lista_vazia_mas_registra_interesse(
    cliente: TestClient, pool: asyncpg.Pool, redis: RedisCluster
) -> None:
    await _limpar(pool, redis, [CELULA_SEM_LEITURA])
    try:
        resposta = cliente.get("/v1/ambiente/camada", params={"bbox": _bbox([CELULA_SEM_LEITURA])})

        assert resposta.status_code == 200
        assert resposta.json() == []
        assert await redis.zscore(ambiente.CHAVE_INTERESSE, CELULA_SEM_LEITURA) is not None
    finally:
        await _limpar(pool, redis, [CELULA_SEM_LEITURA])


async def test_camada_bbox_grande_pede_aproximar(cliente: TestClient, redis: RedisCluster) -> None:
    del redis
    resposta = cliente.get("/v1/ambiente/camada", params={"bbox": "-180,-90,180,90"})

    assert resposta.status_code == 400
    assert resposta.json() == {"detail": "aproxime o mapa"}
