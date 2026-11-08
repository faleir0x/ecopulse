import asyncio
from collections.abc import AsyncIterator
from typing import Any
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from redis.asyncio.cluster import RedisCluster
from redis.exceptions import ConnectionError as RedisConnectionError

from ecopulse_api import limite, main
from ecopulse_common import messaging
from ecopulse_common.cache import create_cluster
from ecopulse_common.config import Settings


class RedisFora:
    async def eval(self, *_: Any) -> list[Any]:
        raise RedisConnectionError("caiu")


class RedisSoIpEsgotado:
    """O balde do aparelho libera; o do IP nega (mede também a chave usada)."""

    def __init__(self) -> None:
        self.chaves: list[str] = []

    async def eval(self, _script: Any, _numkeys: Any, chave: str, *_: Any) -> list[Any]:
        self.chaves.append(chave)
        if chave.startswith("rl:ip:"):
            return [0, "3.2"]
        return [1, "0"]


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


async def test_redis_fora_libera_ip() -> None:
    resultado = await limite.consumir_ip(RedisFora(), "203.0.113.10")  # type: ignore[arg-type]

    assert resultado == limite.Resultado(permitido=True, retry_after_s=0)


async def test_ip_esgotado_arredonda_retry_after_para_cima() -> None:
    resultado = await limite.consumir_ip(RedisSoIpEsgotado(), "203.0.113.10")  # type: ignore[arg-type]

    assert resultado == limite.Resultado(permitido=False, retry_after_s=4)


def test_chave_ip_usa_hash_tag() -> None:
    assert limite.chave_ip("203.0.113.10") == "rl:ip:{203.0.113.10}"


def test_endpoint_nega_por_ip_sem_confiar_em_x_forwarded_for(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    publicados: list[Any] = []
    redis = RedisSoIpEsgotado()

    async def fake_publish(*args: Any, **_: Any) -> None:
        publicados.append(args)

    monkeypatch.setattr(messaging, "publish", fake_publish)
    main.app.state.broker = MagicMock()
    main.app.state.redis = redis
    resposta = TestClient(main.app).post(
        "/v1/relatos",
        json=_relato(),
        headers={"X-Forwarded-For": "198.51.100.99"},
    )

    assert resposta.status_code == 429
    assert resposta.headers["retry-after"] == "4"
    assert publicados == []
    assert "rl:ip:{testclient}" in redis.chaves
    assert all("198.51.100.99" not in chave for chave in redis.chaves)


@pytest.fixture
async def redis() -> AsyncIterator[RedisCluster]:
    cliente = create_cluster(Settings())
    yield cliente
    await cliente.aclose()


@pytest.mark.integration
async def test_token_bucket_ip_no_cluster(redis: RedisCluster) -> None:
    ip = "203.0.113.77"
    chave = limite.chave_ip(ip)
    try:
        resultados = [
            await limite.consumir_ip(redis, ip, capacidade=3, tokens_por_segundo=2)
            for _ in range(4)
        ]
        assert [r.permitido for r in resultados] == [True, True, True, False]
        assert resultados[-1].retry_after_s == 1

        await asyncio.sleep(0.6)  # 2 tokens/s → volta 1 token
        assert (await limite.consumir_ip(redis, ip, capacidade=3, tokens_por_segundo=2)).permitido

        ttl = await redis.ttl(chave)
        assert 0 < ttl <= 2
    finally:
        await redis.delete(chave)


@pytest.mark.integration
async def test_endpoint_respeita_balde_do_ip(cliente: TestClient, redis: RedisCluster) -> None:
    ip = "testclient"
    chave = limite.chave_ip(ip)
    corpo = _relato()
    chave_aparelho = limite.chave(corpo["device_id"])
    try:
        await limite.consumir_ip(redis, ip, capacidade=1, tokens_por_segundo=0.01)
        resposta = cliente.post("/v1/relatos", json=corpo)

        assert resposta.status_code == 429
        assert int(resposta.headers["retry-after"]) >= 1
    finally:
        await redis.delete(chave, chave_aparelho)
