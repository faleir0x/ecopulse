import asyncio
import json
import os
import socket
import subprocess
import sys
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

import aio_pika
import httpx
import pytest
import websockets
from aio_pika.abc import AbstractExchange, AbstractRobustConnection
from websockets.asyncio.client import ClientConnection

from ecopulse_common import geohash, messaging
from ecopulse_common.events import (
    Envelope,
    EventType,
    OcorrenciaPayload,
    Severidade,
    StatusOcorrencia,
    TipoRisco,
)
from ecopulse_realtime import ponte

pytestmark = pytest.mark.integration

CELULA_X = geohash.encode(38.70, -9.16, geohash.CELL_PRECISION)
CELULA_Y = geohash.encode(38.71, -9.15, geohash.CELL_PRECISION)


def _portas_livres(quantidade: int) -> list[int]:
    sockets: list[socket.socket] = []
    try:
        for _ in range(quantidade):
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.bind(("127.0.0.1", 0))
            sockets.append(sock)
        return [int(sock.getsockname()[1]) for sock in sockets]
    finally:
        for sock in sockets:
            sock.close()


def _iniciar(porta: int, env: dict[str, str]) -> subprocess.Popen[bytes]:
    return subprocess.Popen(  # noqa: S603
        [
            sys.executable,
            "-m",
            "uvicorn",
            "ecopulse_realtime.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(porta),
        ],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def _encerrar(processos: list[subprocess.Popen[bytes]]) -> None:
    for processo in processos:
        if processo.poll() is None:
            processo.terminate()
    for processo in processos:
        if processo.poll() is not None:
            continue
        try:
            processo.wait(timeout=5)
        except subprocess.TimeoutExpired:
            processo.kill()
            processo.wait()


async def _esperar_health(
    http: httpx.AsyncClient,
    url: str,
    processos: list[subprocess.Popen[bytes]],
    espera: float = 20.0,
) -> None:
    limite = asyncio.get_running_loop().time() + espera
    while asyncio.get_running_loop().time() < limite:
        for processo in processos:
            if processo.poll() is not None:
                raise AssertionError(f"instância encerrou com código {processo.returncode}")
        try:
            resposta = await http.get(f"{url}/health")
            if resposta.status_code == 200 and resposta.json() == {"status": "ok"}:
                return
        except httpx.HTTPError:
            pass
        await asyncio.sleep(0.1)
    raise AssertionError(f"instância em {url} não respondeu /health em {espera} s")


@pytest.fixture
async def instancias(rabbit: AbstractRobustConnection) -> AsyncIterator[tuple[str, str]]:
    canal = await rabbit.channel()
    fila = await canal.declare_queue(ponte.FILA, durable=True, arguments=messaging.QUORUM)
    await fila.purge()

    portas = _portas_livres(2)
    env = os.environ.copy()
    env["ECOPULSE_REDIS_REMAP_LOCALHOST"] = "true"
    processos = [_iniciar(porta, env) for porta in portas]
    urls = (f"http://127.0.0.1:{portas[0]}", f"http://127.0.0.1:{portas[1]}")
    try:
        async with httpx.AsyncClient(timeout=1.0) as http:
            for url in urls:
                await _esperar_health(http, url, processos)
        yield urls
    finally:
        _encerrar(processos)


def _payload(latitude: float, longitude: float) -> OcorrenciaPayload:
    agora = datetime.now(UTC)
    return OcorrenciaPayload(
        id=uuid4().int % 1_000_000_000,
        tipo=TipoRisco.ALAGAMENTO,
        severidade=Severidade.ALTO,
        latitude=latitude,
        longitude=longitude,
        geohash=geohash.encode(latitude, longitude, geohash.CELL_PRECISION),
        confirmacoes=1,
        status=StatusOcorrencia.ATIVA,
        criada_em=agora,
        atualizada_em=agora,
        expira_em=agora + timedelta(hours=1),
    )


async def _publicar(events: AbstractExchange, payload: OcorrenciaPayload) -> None:
    envelope = Envelope(
        type=EventType.OCORRENCIA_CRIADA,
        geohash=payload.geohash,
        payload=payload.model_dump(mode="json"),
    )
    await messaging.publish(events, envelope)


def _ws_url(url: str) -> str:
    return url.replace("http://", "ws://") + "/v1/ws"


async def _assinar(websocket: ClientConnection, celulas: list[str]) -> None:
    await websocket.send(json.dumps({"op": "subscribe", "cells": celulas}))
    resposta = json.loads(await asyncio.wait_for(websocket.recv(), timeout=5.0))
    assert resposta == {"type": "subscribed", "cells": sorted(set(celulas))}


def _e_alerta(mensagem: dict[str, Any], ocorrencia_id: int) -> bool:
    if not str(mensagem.get("type", "")).startswith("ocorrencia."):
        return False
    ocorrencia = mensagem.get("ocorrencia")
    return isinstance(ocorrencia, dict) and ocorrencia.get("id") == ocorrencia_id


async def _receber(
    websocket: ClientConnection, ocorrencia_id: int, espera: float = 5.0
) -> dict[str, Any]:
    limite = asyncio.get_running_loop().time() + espera
    while True:
        restante = limite - asyncio.get_running_loop().time()
        if restante <= 0:
            raise AssertionError(f"alerta da ocorrência {ocorrencia_id} não chegou")
        try:
            bruto = await asyncio.wait_for(websocket.recv(), timeout=restante)
        except TimeoutError as exc:
            raise AssertionError(f"alerta da ocorrência {ocorrencia_id} não chegou") from exc
        mensagem: dict[str, Any] = json.loads(bruto)
        if _e_alerta(mensagem, ocorrencia_id):
            return mensagem


async def _sem_alerta(websocket: ClientConnection, ocorrencia_id: int, espera: float) -> None:
    limite = asyncio.get_running_loop().time() + espera
    while True:
        restante = limite - asyncio.get_running_loop().time()
        if restante <= 0:
            return
        try:
            bruto = await asyncio.wait_for(websocket.recv(), timeout=restante)
        except TimeoutError:
            return
        mensagem: dict[str, Any] = json.loads(bruto)
        if _e_alerta(mensagem, ocorrencia_id):
            raise AssertionError(f"alerta da ocorrência {ocorrencia_id} chegou onde não devia")


async def test_duas_instancias_entregam_por_celula(
    instancias: tuple[str, str], rabbit: AbstractRobustConnection
) -> None:
    url_a, url_b = instancias
    canal = await rabbit.channel()
    events = await canal.declare_exchange(
        messaging.EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
    )

    async with (
        websockets.connect(_ws_url(url_a)) as ws_a,
        websockets.connect(_ws_url(url_b)) as ws_b,
    ):
        await _assinar(ws_a, [CELULA_X])
        await _assinar(ws_b, [CELULA_X, CELULA_Y])

        evento_x = _payload(38.70, -9.16)
        await _publicar(events, evento_x)
        await _receber(ws_a, evento_x.id)
        await _receber(ws_b, evento_x.id)
        await asyncio.gather(
            _sem_alerta(ws_a, evento_x.id, 1.5),
            _sem_alerta(ws_b, evento_x.id, 1.5),
        )

        evento_y = _payload(38.71, -9.15)
        await _publicar(events, evento_y)
        await _receber(ws_b, evento_y.id)
        await _sem_alerta(ws_a, evento_y.id, 1.0)

        await _assinar(ws_b, [CELULA_Y])
        evento_x2 = _payload(38.70, -9.16)
        await _publicar(events, evento_x2)
        await _receber(ws_a, evento_x2.id)
        await _sem_alerta(ws_b, evento_x2.id, 1.0)

        await ws_a.close()
        await asyncio.sleep(0.2)
        await _assinar(ws_b, [CELULA_X])
        evento_x3 = _payload(38.70, -9.16)
        await _publicar(events, evento_x3)
        await _receber(ws_b, evento_x3.id)

    async with httpx.AsyncClient(timeout=2.0) as http:
        for url in instancias:
            resposta = await http.get(f"{url}/health")
            assert resposta.status_code == 200
