"""Serviço realtime: uvicorn ecopulse_realtime.main:app

Lifespan: configure_logging("realtime"), Redis Cluster (create_cluster), RabbitMQ
(messaging.connect; canal com set_qos(prefetch_count=50)), exchange EVENTS_EXCHANGE (topic,
durável), ponte.iniciar, Distribuidor e tarefa distribuidor.rodar. No encerramento: parar a
tarefa, distribuidor.fechar, fechar conexão e Redis.

GET /health → {"status":"ok"}
GET /ready  → 503 se a conexão do broker estiver fechada
WS  /v1/ws  → protocolo.py. Por conexão:
  - proteção: no máximo MAX_CONEXOES_POR_IP por IP (fecha com 1008), sem nenhuma
    mensagem por INATIVIDADE_S (fecha com 1001) e no máximo MAX_SUBSCRIBES_POR_MINUTO
    assinaturas por minuto (fecha com 1008)
  - tarefa de envio: lê cliente.saida e manda send_text; termina se cliente.lento
    (fecha com código 1013 "try again later")
  - laço de recepção: receive_text → TypeAdapter(Comando).validate_json; subscribe →
    validar_celulas → distribuidor.definir → {"type":"subscribed"}; ping → pong;
    JSON/validação inválidos → {"type":"erro","motivo":...} e continua
  - ao sair (desconexão, lento ou limite): cancela a tarefa de envio, decrementa o
    contador do IP e chama distribuidor.remover (falha no Redis só é logada)
"""

import asyncio
import json
import logging
import time
from collections import deque
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass, field

import aio_pika
from aio_pika.abc import AbstractRobustConnection
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect, status
from pydantic import TypeAdapter, ValidationError
from redis.asyncio.cluster import RedisCluster

from ecopulse_common import messaging
from ecopulse_common.cache import create_cluster
from ecopulse_common.config import Settings
from ecopulse_common.logs import configure_logging
from ecopulse_common.rede import ip_cliente, redes_confiaveis
from ecopulse_realtime import distribuicao, ponte, protocolo

log = logging.getLogger(__name__)

# Proteção do WebSocket exposto na internet (contadores em memória, por instância).
MAX_CONEXOES_POR_IP = 20
INATIVIDADE_S = 90
MAX_SUBSCRIBES_POR_MINUTO = 30
_JANELA_SUBSCRIBE_S = 60.0

_COMANDO = TypeAdapter(protocolo.Comando)


@dataclass
class Servico:
    connection: AbstractRobustConnection
    redis: RedisCluster
    distribuidor: distribuicao.Distribuidor
    parar: asyncio.Event
    tarefa: asyncio.Task[None]
    conexoes_por_ip: dict[str, int] = field(default_factory=dict)


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
    app.state.proxies = redes_confiaveis(settings.proxies_confiaveis)
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


def _ip_cliente(websocket: WebSocket) -> str:
    """IP de origem (regra em ecopulse_common.rede: cabeçalho só de proxy confiável, IPv6 → /64)."""
    direto = websocket.client.host if websocket.client is not None else "desconhecido"
    return ip_cliente(direto, websocket.headers, getattr(websocket.app.state, "proxies", ()))


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
    servico = _servico(websocket)
    ip = _ip_cliente(websocket)
    conexoes = servico.conexoes_por_ip
    if conexoes.get(ip, 0) >= MAX_CONEXOES_POR_IP:
        log.warning("conexão recusada: muitas conexões", extra={"ip": ip})
        await websocket.accept()
        await websocket.close(code=1008, reason="muitas conexões")
        return

    conexoes[ip] = conexoes.get(ip, 0) + 1
    distribuidor = servico.distribuidor
    cliente = distribuicao.Cliente()
    enviador: asyncio.Task[None] | None = None
    assinaturas: deque[float] = deque()
    try:
        await websocket.accept()
        enviador = asyncio.create_task(_enviar(websocket, cliente))
        while True:
            try:
                texto = await asyncio.wait_for(websocket.receive_text(), timeout=INATIVIDADE_S)
            except TimeoutError:
                log.info("conexão inativa", extra={"ip": ip})
                await websocket.close(code=1001, reason="inativo")
                break

            try:
                comando = _COMANDO.validate_json(texto)
            except ValidationError:
                _responder(cliente, {"type": "erro", "motivo": "comando inválido"})
                continue

            if isinstance(comando, protocolo.Subscribe):
                agora = time.monotonic()
                while assinaturas and agora - assinaturas[0] >= _JANELA_SUBSCRIBE_S:
                    assinaturas.popleft()
                if len(assinaturas) >= MAX_SUBSCRIBES_POR_MINUTO:
                    log.warning("conexão fechada: muitas assinaturas", extra={"ip": ip})
                    await websocket.close(code=1008, reason="muitas assinaturas")
                    break
                assinaturas.append(agora)

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
        # Cancela o envio ANTES do remover: se o Redis estiver em failover, a tarefa não vaza.
        if enviador is not None:
            enviador.cancel()
            try:
                await enviador
            except asyncio.CancelledError:
                pass
            except Exception as exc:
                log.warning(
                    "falha na tarefa de envio",
                    extra={"ip": ip, "error": f"{type(exc).__name__}: {exc}"},
                )
        conexoes[ip] -= 1
        if conexoes[ip] <= 0:
            del conexoes[ip]
        try:
            await distribuidor.remover(cliente)
        except Exception as exc:  # falha no Redis não pode impedir a limpeza
            log.warning(
                "falha ao remover cliente",
                extra={"ip": ip, "error": f"{type(exc).__name__}: {exc}"},
            )
