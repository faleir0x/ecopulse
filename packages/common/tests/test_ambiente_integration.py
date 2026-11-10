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


@pytest.mark.integration
async def test_interesse_recusa_celula_nova_com_conjunto_cheio(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    redis: RedisCluster = create_cluster(Settings())
    try:
        await redis.delete(ambiente.CHAVE_INTERESSE, ambiente.CHAVE_COLETADO)
        monkeypatch.setattr(ambiente, "MAX_CELULAS_INTERESSE", 2)
        agora = 1_800_000_000.0

        assert await ambiente.registrar_interesse(redis, "6gycf", agora)
        assert await ambiente.registrar_interesse(redis, "6gyce", agora)
        assert not await ambiente.registrar_interesse(redis, "6gycg", agora)
        assert await redis.zscore(ambiente.CHAVE_INTERESSE, "6gycg") is None

        # Célula já registrada continua sendo atualizada mesmo com o conjunto cheio.
        assert await ambiente.registrar_interesse(redis, "6gycf", agora + 5)
        assert await redis.zscore(ambiente.CHAVE_INTERESSE, "6gycf") == pytest.approx(agora + 5)
    finally:
        await redis.delete(ambiente.CHAVE_INTERESSE, ambiente.CHAVE_COLETADO)
        await redis.aclose()


@pytest.mark.integration
async def test_celulas_ativas_remove_expiradas_do_hash_de_coletadas() -> None:
    redis: RedisCluster = create_cluster(Settings())
    try:
        await redis.delete(ambiente.CHAVE_INTERESSE, ambiente.CHAVE_COLETADO)
        agora = 1_800_000_000.0
        antiga = agora - ambiente.JANELA_INTERESSE_S - 1

        await ambiente.registrar_interesse(redis, "atual", agora)
        await ambiente.registrar_interesse(redis, "velho", antiga)
        await ambiente.marcar_coletada(redis, "atual", agora)
        await ambiente.marcar_coletada(redis, "velho", antiga)

        assert await ambiente.celulas_ativas(redis, agora) == ["atual"]
        assert await redis.hget(ambiente.CHAVE_COLETADO, "velho") is None
        assert await redis.hget(ambiente.CHAVE_COLETADO, "atual") is not None
    finally:
        await redis.delete(ambiente.CHAVE_INTERESSE, ambiente.CHAVE_COLETADO)
        await redis.aclose()
