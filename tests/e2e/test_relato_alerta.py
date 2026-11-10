"""E2E da garantia central: relato em um celular vira alerta no outro em segundos.

Precisa da stack inteira no ar (docker compose up). Roda com:
    uv run pytest -m e2e -s
"""

import asyncio
import json
import math
import os
import random
import time
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import httpx
import pytest
from websockets.asyncio.client import connect
from websockets.exceptions import WebSocketException

from ecopulse_common.geohash import encode

# Área de teste (São Paulo) e raio de comparação entre o ponto e a ocorrência.
LAT_MIN, LAT_MAX = -23.70, -23.40
LON_MIN, LON_MAX = -46.80, -46.40
RAIO_M = 300.0
TIPO = "alagamento"


def _ponto_aleatorio() -> tuple[float, float]:
    """Ponto aleatório na área de teste, para não cair numa ocorrência já existente."""
    gerador = random.SystemRandom()
    return gerador.uniform(LAT_MIN, LAT_MAX), gerador.uniform(LON_MIN, LON_MAX)


def _distancia_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Haversine: distância em metros entre duas coordenadas."""
    raio_terra_m = 6_371_000.0
    rad = math.pi / 180.0
    d_lat = (lat2 - lat1) * rad
    d_lon = (lon2 - lon1) * rad
    h = (
        math.sin(d_lat / 2.0) ** 2
        + math.cos(lat1 * rad) * math.cos(lat2 * rad) * math.sin(d_lon / 2.0) ** 2
    )
    return 2.0 * raio_terra_m * math.asin(h**0.5)


def _json_objeto(bruto: str | bytes) -> dict[str, Any]:
    """Decodifica uma mensagem do WebSocket; falha se não for um objeto JSON."""
    dados = json.loads(bruto)
    if not isinstance(dados, dict):
        pytest.fail(f"mensagem inesperada do WebSocket: {bruto!r}")
    return dados


def _e_o_alerta(mensagem: dict[str, Any], latitude: float, longitude: float) -> bool:
    """True se a mensagem é um alerta do TIPO a menos de RAIO_M do ponto."""
    if mensagem.get("type") not in ("ocorrencia.criada", "ocorrencia.atualizada"):
        return False
    ocorrencia = mensagem.get("ocorrencia")
    if not isinstance(ocorrencia, dict) or ocorrencia.get("tipo") != TIPO:
        return False
    try:
        o_lat = float(ocorrencia["latitude"])
        o_lon = float(ocorrencia["longitude"])
    except (KeyError, TypeError, ValueError):
        return False
    return _distancia_m(latitude, longitude, o_lat, o_lon) < RAIO_M


@pytest.mark.e2e
async def test_relato_vira_alerta_em_segundos() -> None:
    api_url = os.environ.get("ECOPULSE_E2E_API", "http://localhost:8000")
    ws_url = os.environ.get("ECOPULSE_E2E_WS", "ws://localhost:8002/v1/ws")
    timeout_s = float(os.environ.get("ECOPULSE_E2E_TIMEOUT_S", "10"))

    latitude, longitude = _ponto_aleatorio()
    celula = encode(latitude, longitude)
    agora = datetime.now(UTC).isoformat()

    # Abre o "outro celular": assina a célula onde o relato vai cair.
    try:
        conexao = await connect(ws_url, open_timeout=5)
    except (OSError, WebSocketException) as exc:
        pytest.fail(f"WebSocket inacessível em {ws_url}: {exc}")

    async with conexao:
        await conexao.send(json.dumps({"op": "subscribe", "cells": [celula]}))
        try:
            async with asyncio.timeout(5):
                confirmacao = _json_objeto(await conexao.recv())
        except TimeoutError:
            pytest.fail("o WebSocket não confirmou a assinatura em 5 s")
        assert confirmacao.get("type") == "subscribed", confirmacao

        # "Primeiro celular": relata. O cronômetro começa junto com o POST.
        corpo = {
            "client_id": str(uuid4()),
            "device_id": str(uuid4()),
            "tipo": TIPO,
            "severidade": "alto",
            "latitude": latitude,
            "longitude": longitude,
            "registrado_em": agora,
        }
        inicio = time.perf_counter()
        try:
            async with httpx.AsyncClient(base_url=api_url, timeout=5) as cliente:
                resposta = await cliente.post("/v1/relatos", json=corpo)
        except httpx.HTTPError as exc:
            pytest.fail(f"API inacessível em {api_url}: {exc}")
        if resposta.status_code != 202:
            pytest.fail(f"POST /v1/relatos respondeu {resposta.status_code}: {resposta.text}")

        # Espera o alerta chegar; mensagens de outras células/tipos são ignoradas.
        try:
            async with asyncio.timeout(timeout_s):
                while True:
                    mensagem = _json_objeto(await conexao.recv())
                    if _e_o_alerta(mensagem, latitude, longitude):
                        # Mede aqui: o fechamento do WebSocket não entra na latência
                        latencia = time.perf_counter() - inicio
                        break
        except TimeoutError:
            pytest.fail(
                f"nenhum alerta de {TIPO} a menos de {RAIO_M:.0f} m chegou em "
                f"{timeout_s:.0f} s (ponto {latitude:.5f}, {longitude:.5f}, célula {celula})"
            )

    print(f"latencia relato→alerta: {latencia:.2f} s")
    if latencia > timeout_s:
        pytest.fail(f"alerta chegou em {latencia:.2f} s, acima do limite de {timeout_s:.0f} s")
