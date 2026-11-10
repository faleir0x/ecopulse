import asyncio
from collections.abc import AsyncIterator
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from redis.asyncio.cluster import RedisCluster
from redis.exceptions import ConnectionError as RedisConnectionError

from ecopulse_api import limite, main
from ecopulse_common.cache import create_cluster
from ecopulse_common.config import Settings


class RedisFora:
    async def eval(self, *_: Any) -> list[Any]:
        raise RedisConnectionError("caiu")


class RedisEsgotado:
    async def eval(self, *_: Any) -> list[Any]:
        return [0, "12.3"]


def _relato() -> dict[str, Any]:
    return {
        "client_id": str(uuid4()),
        "device_id": str(uuid4()),
        "tipo": "alagamento",
        "severidade": "alto",
        "latitude": -23.55,
        "longitude": -46.63,
        "registrado_em": "2026-11-07T12:00:00Z",
    }


async def test_redis_fora_libera() -> None:
    resultado = await limite.consumir(RedisFora(), uuid4())  # type: ignore[arg-type]

    assert resultado == limite.Resultado(permitido=True, retry_after_s=0)


async def test_esgotado_arredonda_retry_after_para_cima() -> None:
    resultado = await limite.consumir(RedisEsgotado(), uuid4())  # type: ignore[arg-type]

    assert resultado == limite.Resultado(permitido=False, retry_after_s=13)


def test_endpoint_responde_429_sem_publicar(publicador_falso: Any, limitador_falso: Any) -> None:
    limitador_falso.negar("relato", 13)
    resposta = TestClient(main.app).post("/v1/relatos", json=_relato())

    assert resposta.status_code == 429
    assert resposta.headers["retry-after"] == "13"
    assert publicador_falso.envelopes == []


def test_chave_usa_hash_tag() -> None:
    device = uuid4()
    assert limite.chave(device) == f"rl:{{{device}}}"


@pytest.fixture
async def redis() -> AsyncIterator[RedisCluster]:
    cliente = create_cluster(Settings())
    yield cliente
    await cliente.aclose()


@pytest.mark.integration
async def test_token_bucket_no_cluster(redis: RedisCluster) -> None:
    device = uuid4()
    try:
        # Taxa lenta (1 token a cada 10 s): com a máquina carregada, o tempo entre as chamadas
        # não devolve token antes da 4ª e o teste não depende de velocidade
        resultados = [
            await limite.consumir(redis, device, capacidade=3, tokens_por_segundo=0.1)
            for _ in range(4)
        ]
        assert [r.permitido for r in resultados] == [True, True, True, False]
        assert resultados[-1].retry_after_s == 10

        # 4 tokens/s a partir daqui: 0,6 s devolve com folga pelo menos 1 token
        await asyncio.sleep(0.6)
        assert (await limite.consumir(redis, device, capacidade=3, tokens_por_segundo=4)).permitido

        ttl = await redis.ttl(limite.chave(device))
        assert ttl > 0
    finally:
        await redis.delete(limite.chave(device))


@pytest.mark.integration
async def test_aparelhos_tem_baldes_independentes(redis: RedisCluster) -> None:
    a, b = uuid4(), uuid4()
    try:
        for _ in range(2):
            await limite.consumir(redis, a, capacidade=2, tokens_por_segundo=0.01)
        assert not (
            await limite.consumir(redis, a, capacidade=2, tokens_por_segundo=0.01)
        ).permitido
        assert (await limite.consumir(redis, b, capacidade=2, tokens_por_segundo=0.01)).permitido
    finally:
        await redis.delete(limite.chave(a), limite.chave(b))
