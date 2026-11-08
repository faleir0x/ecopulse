"""Serviço realtime: uvicorn ecopulse_realtime.main:app

Lifespan: configure_logging("realtime"), Redis Cluster (create_cluster), RabbitMQ
(messaging.connect; canal com set_qos(prefetch_count=50)), exchange EVENTS_EXCHANGE (topic,
durável), ponte.iniciar, Distribuidor e tarefa distribuidor.rodar. No encerramento: parar a
tarefa, distribuidor.fechar, fechar conexão e Redis.

GET /health → {"status":"ok"}
GET /ready  → 503 se a conexão do broker estiver fechada
WS  /v1/ws  → protocolo.py. Por conexão:
  - tarefa de envio: lê cliente.saida e manda send_text; termina se cliente.lento
    (fecha com código 1013 "try again later")
  - laço de recepção: receive_text → TypeAdapter(Comando).validate_json; subscribe →
    validar_celulas → distribuidor.definir → {"type":"subscribed"}; ping → pong;
    JSON/validação inválidos → {"type":"erro","motivo":...} e continua
  - ao sair (desconexão ou lento): distribuidor.remover e cancelar a tarefa de envio
"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass

import aio_pika
from aio_pika.abc import AbstractRobustConnection
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from pydantic import TypeAdapter, ValidationError
from redis.asyncio.cluster import RedisCluster

from ecopulse_common import messaging
from ecopulse_common.cache import create_cluster
from ecopulse_common.config import Settings
from ecopulse_common.logs import configure_logging
from ecopulse_realtime import distribuicao, ponte, protocolo

log = logging.getLogger(__name__)

_COMANDO = TypeAdapter(protocolo.Comando)


@dataclass
class Servico:
    connection: AbstractRobustConnection
    redis: RedisCluster
    distribuidor: distribuicao.Distribuidor
    parar: asyncio.Event
    tarefa: asyncio.Task[None]


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = Settings()
    configure_logging("realtime", settings.log_level)
    log.info("iniciando realtime")
    connection = await messaging.connect(settings.rabbit_url)
    channel = await connection.channel()
    await channel.set_qos(prefetch_count=50)
    events = await channel.declare_exchange(
        messaging.EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
    )
    redis = create_cluster(settings)
    await redis.initialize()
    await ponte.iniciar(channel, events, redis)
    distribuidor = distribuicao.Distribuidor(redis)
    parar = asyncio.Event()
    tarefa = asyncio.create_task(distribuidor.rodar(parar))
    app.state.servico = Servico(
        connection=connection,
        redis=redis,
        distribuidor=distribuidor,
        parar=parar,
        tarefa=tarefa,
    )
    try:
        yield
    finally:
        log.info("encerrando realtime")
        parar.set()
        with suppress(asyncio.CancelledError):
            await tarefa
        await distribuidor.fechar()
        await connection.close()
        await redis.aclose()


app = FastAPI(title="EcoPulse Realtime", version="0.1.0", lifespan=lifespan)


def _servico(escopo: Request | WebSocket) -> Servico:
    servico: Servico = escopo.app.state.servico
    return servico


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness: o processo está de pé."""
    return {"status": "ok"}


@app.get("/ready")
async def ready(request: Request) -> dict[str, str]:
    """Readiness: conectado ao broker."""
    if _servico(request).connection.is_closed:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "broker indisponível")
    return {"status": "ok"}


def _responder(cliente: distribuicao.Cliente, mensagem: dict[str, object]) -> None:
    """Respostas também passam pela fila: só a tarefa de envio escreve no socket."""
    try:
        cliente.saida.put_nowait(json.dumps(mensagem, ensure_ascii=False))
    except asyncio.QueueFull:
        cliente.lento.set()


async def _enviar(websocket: WebSocket, cliente: distribuicao.Cliente) -> None:
    while True:
        mensagem = await cliente.saida.get()
        if cliente.lento.is_set():
            await websocket.close(code=1013, reason="try again later")
            return
        await websocket.send_text(mensagem)


@app.websocket("/v1/ws")
async def websocket_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    distribuidor = _servico(websocket).distribuidor
    cliente = distribuicao.Cliente()
    enviador = asyncio.create_task(_enviar(websocket, cliente))
    try:
        while True:
            try:
                comando = _COMANDO.validate_json(await websocket.receive_text())
            except ValidationError:
                _responder(cliente, {"type": "erro", "motivo": "comando inválido"})
                continue

            if isinstance(comando, protocolo.Subscribe):
                try:
                    celulas = protocolo.validar_celulas(comando.cells)
                except ValueError as exc:
                    _responder(cliente, {"type": "erro", "motivo": str(exc)})
                    continue
                await distribuidor.definir(cliente, frozenset(celulas))
                _responder(cliente, {"type": "subscribed", "cells": celulas})
            else:
                _responder(cliente, {"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        await distribuidor.remover(cliente)
        enviador.cancel()
        with suppress(asyncio.CancelledError):
            await enviador
