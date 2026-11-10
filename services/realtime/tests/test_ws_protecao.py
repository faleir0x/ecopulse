import asyncio
import threading
from collections.abc import Iterator
from contextlib import ExitStack
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import WebSocket
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from ecopulse_realtime import distribuicao, main


class _DistribuidorFalso:
    """Distribuidor mínimo: não fala com o Redis e pode falhar no remover."""

    def __init__(self) -> None:
        self.removidos: list[distribuicao.Cliente] = []
        self.falhar_remover = False

    async def definir(self, _cliente: distribuicao.Cliente, _celulas: frozenset[str]) -> None:
        pass

    async def remover(self, cliente: distribuicao.Cliente) -> None:
        if self.falhar_remover:
            raise RuntimeError("Redis em failover")
        self.removidos.append(cliente)


@pytest.fixture
def ambiente(
    monkeypatch: pytest.MonkeyPatch,
) -> Iterator[tuple[TestClient, _DistribuidorFalso, dict[str, int]]]:
    """App sem lifespan (sem RabbitMQ/Redis): serviço falso e contador zerado por teste."""
    distribuidor = _DistribuidorFalso()
    conexoes: dict[str, int] = {}
    servico = SimpleNamespace(distribuidor=distribuidor, conexoes_por_ip=conexoes)
    monkeypatch.setattr(main.app.state, "servico", servico, raising=False)
    monkeypatch.setattr(main.app.state, "proxies", frozenset(), raising=False)
    cliente = TestClient(main.app)
    try:
        yield cliente, distribuidor, conexoes
    finally:
        cliente.close()


def test_ipv6_direto_vira_rede_64() -> None:
    assert main._ip_cliente(_websocket_falso("2001:db8:1:2:abcd:ef01:2345:6789")) == (
        "2001:db8:1:2::/64"
    )


def test_cf_connecting_ip_so_vale_para_proxy_confiavel() -> None:
    cabecalhos = {"cf-connecting-ip": "198.51.100.7"}

    assert (
        main._ip_cliente(
            _websocket_falso("testclient", proxies=frozenset({"testclient"}), cabecalhos=cabecalhos)
        )
        == "198.51.100.7"
    )
    assert main._ip_cliente(_websocket_falso("203.0.113.5", cabecalhos=cabecalhos)) == "203.0.113.5"


def test_21a_conexao_do_mesmo_ip_e_recusada(
    ambiente: tuple[TestClient, _DistribuidorFalso, dict[str, int]],
) -> None:
    cliente, _, _ = ambiente

    with ExitStack() as pilha:
        for _ in range(main.MAX_CONEXOES_POR_IP):
            pilha.enter_context(cliente.websocket_connect("/v1/ws"))

        with (
            cliente.websocket_connect("/v1/ws") as websocket,
            pytest.raises(WebSocketDisconnect) as recusa,
        ):
            websocket.receive_json()

    assert recusa.value.code == 1008
    assert recusa.value.reason == "muitas conexões"


def test_31o_subscribe_em_menos_de_um_minuto_fecha_a_conexao(
    ambiente: tuple[TestClient, _DistribuidorFalso, dict[str, int]],
) -> None:
    cliente, _, _ = ambiente
    comando = {"op": "subscribe", "cells": ["eycs20"]}

    with cliente.websocket_connect("/v1/ws") as websocket:
        for _ in range(main.MAX_SUBSCRIBES_POR_MINUTO):
            websocket.send_json(comando)
            assert websocket.receive_json() == {"type": "subscribed", "cells": ["eycs20"]}

        websocket.send_json(comando)
        with pytest.raises(WebSocketDisconnect) as fechamento:
            websocket.receive_json()

    assert fechamento.value.code == 1008
    assert fechamento.value.reason == "muitas assinaturas"


def test_remover_que_levanta_nao_impede_cancelar_a_tarefa_de_envio(
    ambiente: tuple[TestClient, _DistribuidorFalso, dict[str, int]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cliente, distribuidor, _ = ambiente
    distribuicao_encerrada = threading.Event()

    async def enviar_bloqueado(_websocket: WebSocket, _cliente: distribuicao.Cliente) -> None:
        try:
            await asyncio.Event().wait()
        finally:
            distribuicao_encerrada.set()

    monkeypatch.setattr(main, "_enviar", enviar_bloqueado)
    distribuidor.falhar_remover = True

    with cliente.websocket_connect("/v1/ws"):
        pass

    assert distribuicao_encerrada.wait(timeout=2.0)


def test_inatividade_fecha_a_conexao(
    ambiente: tuple[TestClient, _DistribuidorFalso, dict[str, int]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    cliente, _, _ = ambiente
    monkeypatch.setattr(main, "INATIVIDADE_S", 0.05)

    with (
        cliente.websocket_connect("/v1/ws") as websocket,
        pytest.raises(WebSocketDisconnect) as fechamento,
    ):
        websocket.receive_json()

    assert fechamento.value.code == 1001
    assert fechamento.value.reason == "inativo"


def _websocket_falso(
    host: str,
    *,
    proxies: frozenset[str] = frozenset(),
    cabecalhos: dict[str, str] | None = None,
) -> Any:
    """WebSocket falsa o suficiente para _ip_cliente (client, headers e app.state.proxies)."""
    return SimpleNamespace(
        client=SimpleNamespace(host=host),
        headers=cabecalhos or {},
        app=SimpleNamespace(state=SimpleNamespace(proxies=proxies)),
    )
