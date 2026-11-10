import asyncio
from collections.abc import AsyncIterator
from types import SimpleNamespace
from typing import Any
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from redis.asyncio.cluster import RedisCluster
from redis.exceptions import ConnectionError as RedisConnectionError

from ecopulse_api import limite, main
from ecopulse_common.cache import create_cluster
from ecopulse_common.config import Settings
from ecopulse_common.rede import Rede, redes_confiaveis


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
    publicador_falso: Any, limitador_falso: Any
) -> None:
    limitador_falso.negar("ip", 4)
    resposta = TestClient(main.app).post(
        "/v1/relatos",
        json=_relato(),
        headers={"X-Forwarded-For": "198.51.100.99"},
    )

    assert resposta.status_code == 429
    assert resposta.headers["retry-after"] == "4"
    assert publicador_falso.envelopes == []
    assert ("ip", "testclient") in limitador_falso.chamadas
    assert all("198.51.100.99" not in chave for _, chave in limitador_falso.chamadas)


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
        # Balde vazio com o "último reabastecimento" 2 min no futuro: não recupera token
        # durante o teste, por mais que a primeira chamada do TestClient demore
        segundos, _ = await redis.time()
        await redis.hset(chave, mapping={"tokens": "0", "ts": str(int(segundos) + 120)})
        resposta = cliente.post("/v1/relatos", json=corpo)

        assert resposta.status_code == 429
        assert int(resposta.headers["retry-after"]) >= 1
    finally:
        await redis.delete(chave, chave_aparelho)


PROXY = "10.89.70.250"


def _post_com_cabecalhos(
    limitador: Any, proxies: tuple[Rede, ...], cabecalhos: dict[str, str]
) -> list[tuple[str, str]]:
    """Faz um POST de relato vindo do IP do proxy e devolve os baldes consultados."""
    main.app.state.proxies = proxies
    try:
        TestClient(main.app, client=(PROXY, 50000)).post(
            "/v1/relatos", json=_relato(), headers=cabecalhos
        )
    finally:
        main.app.state.proxies = ()
    chamadas: list[tuple[str, str]] = limitador.chamadas
    return chamadas


def test_cf_connecting_ip_vale_quando_vem_do_tunel(
    publicador_falso: Any, limitador_falso: Any
) -> None:
    chaves = _post_com_cabecalhos(
        limitador_falso, redes_confiaveis(PROXY), {"CF-Connecting-IP": "203.0.113.5"}
    )

    assert ("ip", "203.0.113.5") in chaves


def test_x_real_ip_do_nginx_proxy_manager_numa_faixa(
    publicador_falso: Any, limitador_falso: Any
) -> None:
    chaves = _post_com_cabecalhos(
        limitador_falso, redes_confiaveis("10.89.70.0/24"), {"X-Real-IP": "203.0.113.9"}
    )

    assert ("ip", "203.0.113.9") in chaves


def test_cf_connecting_ip_ignorado_fora_do_tunel(
    publicador_falso: Any, limitador_falso: Any
) -> None:
    chaves = _post_com_cabecalhos(limitador_falso, (), {"CF-Connecting-IP": "203.0.113.5"})

    assert ("ip", PROXY) in chaves
    assert all("203.0.113.5" not in chave for _, chave in chaves)


def test_cf_connecting_ip_invalido_usa_o_ip_da_conexao(
    publicador_falso: Any, limitador_falso: Any
) -> None:
    chaves = _post_com_cabecalhos(
        limitador_falso, redes_confiaveis(PROXY), {"CF-Connecting-IP": "nao-e-ip"}
    )

    assert ("ip", PROXY) in chaves


def _pedido(
    host: str,
    *,
    proxies: tuple[Rede, ...] = (),
    cabecalhos: dict[str, str] | None = None,
) -> Any:
    """Request falsa o suficiente para _ip_cliente (client, headers e app.state.proxies)."""
    return SimpleNamespace(
        client=SimpleNamespace(host=host),
        headers=cabecalhos or {},
        app=SimpleNamespace(state=SimpleNamespace(proxies=proxies)),
    )


def test_ipv6_direto_vira_rede_64() -> None:
    pedido = _pedido("2001:db8:1:2:abcd:ef01:2345:6789")

    assert main._ip_cliente(pedido) == "2001:db8:1:2::/64"


def test_ipv6_do_tunel_vira_rede_64() -> None:
    pedido = _pedido(
        PROXY,
        proxies=redes_confiaveis(PROXY),
        cabecalhos={"cf-connecting-ip": "2001:db8:1:2:abcd::99"},
    )

    assert main._ip_cliente(pedido) == "2001:db8:1:2::/64"


def test_ipv4_direto_fica_inalterado() -> None:
    pedido = _pedido("203.0.113.5")

    assert main._ip_cliente(pedido) == "203.0.113.5"


def test_ipv4_do_tunel_fica_inalterado() -> None:
    pedido = _pedido(
        PROXY,
        proxies=redes_confiaveis(PROXY),
        cabecalhos={"cf-connecting-ip": "198.51.100.7"},
    )

    assert main._ip_cliente(pedido) == "198.51.100.7"
