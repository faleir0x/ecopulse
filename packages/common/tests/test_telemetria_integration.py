import pytest
from redis.asyncio.cluster import RedisCluster

from ecopulse_common import telemetria
from ecopulse_common.cache import create_cluster
from ecopulse_common.config import Settings

CELULA = "6gyf4b"


@pytest.mark.integration
async def test_registra_e_conta_aparelhos_na_janela() -> None:
    redis: RedisCluster = create_cluster(Settings())
    chave = telemetria.chave_presenca(CELULA)
    agora = 1_800_000_000.0
    try:
        await redis.delete(chave)
        # O antigo vem primeiro: cada registro remove quem já saiu da janela naquele momento
        await telemetria.registrar_presenca(
            redis,
            CELULA,
            "aparelho-antigo",
            agora - telemetria.JANELA_PRESENCA_S - 1,
        )
        await telemetria.registrar_presenca(redis, CELULA, "aparelho-2", agora - 60)
        await telemetria.registrar_presenca(redis, CELULA, "aparelho-1", agora)

        assert await telemetria.contar_presenca(redis, [CELULA], agora) == 2
        assert await redis.zscore(chave, "aparelho-antigo") is None

        ttl = await redis.ttl(chave)
        assert 0 < ttl <= telemetria.JANELA_PRESENCA_S
    finally:
        await redis.delete(chave)
        await redis.aclose()


@pytest.mark.integration
async def test_conta_somando_celulas() -> None:
    redis: RedisCluster = create_cluster(Settings())
    vizinha = "6gyf4c"
    agora = 1_800_000_000.0
    try:
        await redis.delete(telemetria.chave_presenca(CELULA), telemetria.chave_presenca(vizinha))
        await telemetria.registrar_presenca(redis, CELULA, "aparelho-1", agora)
        await telemetria.registrar_presenca(redis, vizinha, "aparelho-2", agora)

        assert await telemetria.contar_presenca(redis, [CELULA, vizinha], agora) == 2
    finally:
        await redis.delete(telemetria.chave_presenca(CELULA), telemetria.chave_presenca(vizinha))
        await redis.aclose()
