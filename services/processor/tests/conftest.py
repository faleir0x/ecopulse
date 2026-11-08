from collections.abc import AsyncIterator

import asyncpg
import pytest

from ecopulse_common.config import Settings
from ecopulse_common.db import create_pool


async def _limpar(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "TRUNCATE outbox, resolucoes, relatos, ocorrencias RESTART IDENTITY CASCADE"
        )


@pytest.fixture
async def pool() -> AsyncIterator[asyncpg.Pool]:
    try:
        pool = await create_pool(Settings().database_url, min_size=1, max_size=10)
    except Exception as exc:
        pytest.skip(f"PostgreSQL indisponível em {Settings().database_url}: {exc}")

    try:
        await _limpar(pool)
        yield pool
    finally:
        await _limpar(pool)
        await pool.close()
