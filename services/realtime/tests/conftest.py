from collections.abc import AsyncIterator

import pytest
from aio_pika.abc import AbstractRobustConnection
from fastapi.testclient import TestClient
from redis.asyncio.cluster import RedisCluster

from ecopulse_common import messaging
from ecopulse_common.cache import create_cluster
from ecopulse_common.config import Settings
from ecopulse_realtime import main, ponte


@pytest.fixture
async def rabbit() -> AsyncIterator[AbstractRobustConnection]:
    settings = Settings()
    try:
        connection = await messaging.connect(settings.rabbit_url)
    except Exception as exc:
        pytest.skip(f"RabbitMQ indisponível em {settings.rabbit_url}: {exc}")

    try:
        yield connection
    finally:
        await connection.close()


@pytest.fixture
async def redis() -> AsyncIterator[RedisCluster]:
    settings = Settings()
    redis = create_cluster(settings)
    try:
        await redis.ping()
    except Exception as exc:
        await redis.aclose()
        pytest.skip(f"Redis indisponível em {settings.redis_nodes}: {exc}")

    try:
        yield redis
    finally:
        await redis.aclose()


@pytest.fixture
async def cliente(rabbit: AbstractRobustConnection) -> AsyncIterator[TestClient]:
    channel = await rabbit.channel()
    fila = await channel.declare_queue(ponte.FILA, durable=True, arguments=messaging.QUORUM)
    await fila.purge()

    with TestClient(main.app) as client:
        yield client
