from collections.abc import AsyncIterator

import pytest
from redis.asyncio.cluster import RedisCluster

from ecopulse_common import ambiente
from ecopulse_common.cache import create_cluster
from ecopulse_common.config import Settings


@pytest.fixture
async def redis() -> AsyncIterator[RedisCluster]:
    settings = Settings()
    redis = create_cluster(settings)
    try:
        await redis.ping()
    except Exception as exc:
        await redis.aclose()
        pytest.skip(f"Redis indisponível em {settings.redis_nodes}: {exc}")

    await redis.delete(ambiente.CHAVE_INTERESSE, ambiente.CHAVE_COLETADO)
    try:
        yield redis
    finally:
        await redis.delete(ambiente.CHAVE_INTERESSE, ambiente.CHAVE_COLETADO)
        await redis.aclose()
