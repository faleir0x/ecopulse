from collections.abc import AsyncIterator, Iterator

import asyncpg
import pytest
from fastapi.testclient import TestClient
from redis.asyncio.cluster import RedisCluster

from ecopulse_api import limite, main, portas
from ecopulse_common.cache import create_cluster
from ecopulse_common.config import Settings
from ecopulse_common.db import create_pool
from ecopulse_common.events import Envelope


class PublicadorFalso:
    """Adaptador de teste: guarda os envelopes publicados numa lista."""

    def __init__(self) -> None:
        self.envelopes: list[Envelope] = []
        self.erro: Exception | None = None

    async def publicar(self, envelope: Envelope) -> None:
        if self.erro is not None:
            raise self.erro
        self.envelopes.append(envelope)


class LimitadorFalso:
    """Adaptador de teste: libera tudo, salvo os baldes configurados como negados."""

    def __init__(self) -> None:
        self.chamadas: list[tuple[str, str]] = []
        self.negados: dict[str, limite.Resultado] = {}

    def negar(self, balde: str, retry_after_s: int) -> None:
        self.negados[balde] = limite.Resultado(permitido=False, retry_after_s=retry_after_s)

    async def consumir(self, balde: str, chave: str) -> limite.Resultado:
        self.chamadas.append((balde, chave))
        return self.negados.get(balde, limite.Resultado(permitido=True, retry_after_s=0))


@pytest.fixture
def publicador_falso() -> Iterator[PublicadorFalso]:
    """Injeta o publicador falso; os testes leem `envelopes` e podem definir `erro`."""
    falso = PublicadorFalso()
    main.app.dependency_overrides[portas.publicador] = lambda: falso
    try:
        yield falso
    finally:
        main.app.dependency_overrides.pop(portas.publicador, None)


@pytest.fixture
def limitador_falso() -> Iterator[LimitadorFalso]:
    """Injeta o limitador falso; os testes configuram negações com `negar`."""
    falso = LimitadorFalso()
    main.app.dependency_overrides[portas.limitador] = lambda: falso
    try:
        yield falso
    finally:
        main.app.dependency_overrides.pop(portas.limitador, None)


@pytest.fixture
def publicados(
    publicador_falso: PublicadorFalso, limitador_falso: LimitadorFalso
) -> list[Envelope]:
    """Atalho para os testes que só querem ver os envelopes publicados.

    Depende do limitador falso para que o endpoint não tente falar com o Redis de produção.
    """
    del limitador_falso
    return publicador_falso.envelopes


async def _limpar_banco(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "TRUNCATE aparelhos, outbox, resolucoes, relatos, ocorrencias RESTART IDENTITY CASCADE"
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
