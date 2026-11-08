from collections.abc import AsyncIterator

import asyncpg
import pytest
from fastapi.testclient import TestClient
from redis.asyncio.cluster import RedisCluster

from ecopulse_api import main
from ecopulse_common.cache import create_cluster
from ecopulse_common.config import Settings
from ecopulse_common.db import create_pool


async def _limpar_banco(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "TRUNCATE outbox, resolucoes, relatos, ocorrencias RESTART IDENTITY CASCADE"
        )


async def _limpar_cache(redis: RedisCluster) -> None:
    chaves = [chave async for chave in redis.scan_iter(match="cell:*")]
    if chaves:
        await redis.delete(*chaves)


@pytest.fixture
async def pool() -> AsyncIterator[asyncpg.Pool]:
    settings = Settings()
    try:
        pool = await create_pool(settings.database_url, min_size=1, max_size=5)
    except Exception as exc:
        pytest.skip(f"PostgreSQL indisponível em {settings.database_url}: {exc}")

    await _limpar_banco(pool)
    try:
        yield pool
    finally:
        await _limpar_banco(pool)
        await pool.close()


@pytest.fixture
async def redis() -> AsyncIterator[RedisCluster]:
    settings = Settings()
    redis = create_cluster(settings)
    try:
        await redis.ping()
    except Exception as exc:
        await redis.aclose()
        pytest.skip(f"Redis indisponível em {settings.redis_nodes}: {exc}")

    await _limpar_cache(redis)
    try:
        yield redis
    finally:
        await _limpar_cache(redis)
        await redis.aclose()


@pytest.fixture
async def cliente() -> AsyncIterator[TestClient]:
    with TestClient(main.app) as client:
        yield client
