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
async def test_interesse_cheio_descarta_a_celula_pedida_ha_mais_tempo(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    redis: RedisCluster = create_cluster(Settings())
    try:
        await redis.delete(ambiente.CHAVE_INTERESSE, ambiente.CHAVE_COLETADO)
        monkeypatch.setattr(ambiente, "MAX_CELULAS_INTERESSE", 2)
        agora = 1_800_000_000.0

        assert await ambiente.registrar_interesse(redis, "6gycf", agora)
        assert await ambiente.registrar_interesse(redis, "6gyce", agora + 1)
        await ambiente.marcar_coletada(redis, "6gycf", agora)

        # Conjunto cheio: a nova entra e a pedida há mais tempo sai (também das coletadas)
        assert await ambiente.registrar_interesse(redis, "6gycg", agora + 2)
        assert await redis.zscore(ambiente.CHAVE_INTERESSE, "6gycg") is not None
        assert await redis.zscore(ambiente.CHAVE_INTERESSE, "6gycf") is None
        assert await redis.hget(ambiente.CHAVE_COLETADO, "6gycf") is None
        assert await redis.zcard(ambiente.CHAVE_INTERESSE) == 2

        # Célula já registrada só atualiza o horário, sem descartar ninguém
        assert await ambiente.registrar_interesse(redis, "6gyce", agora + 5)
        assert await redis.zscore(ambiente.CHAVE_INTERESSE, "6gyce") == pytest.approx(agora + 5)
        assert await redis.zcard(ambiente.CHAVE_INTERESSE) == 2
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
