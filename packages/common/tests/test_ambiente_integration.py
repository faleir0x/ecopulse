import pytest
from redis.asyncio.cluster import RedisCluster

from ecopulse_common import ambiente
from ecopulse_common.cache import create_cluster
from ecopulse_common.config import Settings


@pytest.mark.integration
async def test_interesse_e_coleta() -> None:
    redis: RedisCluster = create_cluster(Settings())
    try:
        await redis.delete(ambiente.CHAVE_INTERESSE, ambiente.CHAVE_COLETADO)
        agora = 1_800_000_000.0
        await ambiente.registrar_interesse(redis, "6gycf", agora)
        await ambiente.registrar_interesse(redis, "velho", agora - ambiente.JANELA_INTERESSE_S - 1)

        assert await ambiente.celulas_ativas(redis, agora) == ["6gycf"]
        assert await ambiente.coletadas_em(redis, ["6gycf"]) == {}

        await ambiente.marcar_coletada(redis, "6gycf", agora)
        assert await ambiente.coletadas_em(redis, ["6gycf", "outra"]) == {"6gycf": agora}
    finally:
        await redis.delete(ambiente.CHAVE_INTERESSE, ambiente.CHAVE_COLETADO)
        await redis.aclose()
