import pytest
from redis.asyncio.cluster import RedisCluster

from ecopulse_common import ordem
from ecopulse_common.cache import create_cluster
from ecopulse_common.config import Settings

OCORRENCIA_ID = 987_654


@pytest.mark.integration
async def test_versao_atual_aceita_e_recusa_em_ordem() -> None:
    redis: RedisCluster = create_cluster(Settings())
    chave = ordem.chave_versao("teste", OCORRENCIA_ID)
    try:
        await redis.delete(chave)

        assert await ordem.versao_atual(redis, "teste", OCORRENCIA_ID, 1) is True
        assert await ordem.versao_atual(redis, "teste", OCORRENCIA_ID, 3) is True
        assert await ordem.versao_atual(redis, "teste", OCORRENCIA_ID, 2) is False
        assert await ordem.versao_atual(redis, "teste", OCORRENCIA_ID, 3) is True
        assert await ordem.versao_atual(redis, "teste", OCORRENCIA_ID, 4) is True
    finally:
        await redis.delete(chave)
        await redis.aclose()


@pytest.mark.integration
async def test_versao_atual_isola_consumidores() -> None:
    redis: RedisCluster = create_cluster(Settings())
    chave_a = ordem.chave_versao("consumidor-a", OCORRENCIA_ID)
    chave_b = ordem.chave_versao("consumidor-b", OCORRENCIA_ID)
    try:
        await redis.delete(chave_a, chave_b)

        assert await ordem.versao_atual(redis, "consumidor-a", OCORRENCIA_ID, 5) is True
        assert await ordem.versao_atual(redis, "consumidor-b", OCORRENCIA_ID, 1) is True
        assert await ordem.versao_atual(redis, "consumidor-b", OCORRENCIA_ID, 2) is True
        assert await ordem.versao_atual(redis, "consumidor-b", OCORRENCIA_ID, 1) is False
    finally:
        await redis.delete(chave_a, chave_b)
        await redis.aclose()
