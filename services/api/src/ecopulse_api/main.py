import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

import asyncpg
from aio_pika.abc import AbstractRobustConnection
from aio_pika.exceptions import AMQPError
from fastapi import FastAPI, HTTPException, Query, Request, status
from redis.asyncio.cluster import RedisCluster

from ecopulse_api import invalidacao, leitura, limite
from ecopulse_api.schemas import ConfirmacaoIn, RelatoAceito, RelatoIn
from ecopulse_common import geohash, messaging
from ecopulse_common.cache import create_cluster
from ecopulse_common.config import Settings
from ecopulse_common.db import create_pool
from ecopulse_common.events import (
    Envelope,
    EventType,
    OcorrenciaPayload,
    RelatoRecebido,
    StatusOcorrencia,
    TipoRisco,
)
from ecopulse_common.logs import configure_logging
from ecopulse_common.messaging import Topology

log = logging.getLogger(__name__)


@dataclass
class Broker:
    connection: AbstractRobustConnection
    topology: Topology


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = Settings()
    configure_logging("api", settings.log_level)
    connection = await messaging.connect(settings.rabbit_url)
    # on_return_raises: relato sem fila de destino vira erro (503), não some em silêncio
    channel = await connection.channel(publisher_confirms=True, on_return_raises=True)
    topology = await messaging.declare_topology(channel, settings.partitions)
    pool = await create_pool(settings.database_url)
    redis = create_cluster(settings)
    await invalidacao.iniciar(await connection.channel(), topology.events, redis)
    app.state.broker = Broker(connection, topology)
    app.state.pool = pool
    app.state.redis = redis
    yield
    await connection.close()
    await redis.aclose()
    await pool.close()


app = FastAPI(title="EcoPulse API", version="0.1.0", lifespan=lifespan)


def _broker(request: Request) -> Broker:
    broker: Broker = request.app.state.broker
    return broker


def _pool(request: Request) -> asyncpg.Pool:
    pool: asyncpg.Pool = request.app.state.pool
    return pool


def _redis(request: Request) -> RedisCluster:
    redis: RedisCluster = request.app.state.redis
    return redis


async def _aplicar_limite(request: Request, device_id: UUID) -> None:
    """429 com Retry-After se o aparelho estourou o token bucket."""
    resultado = await limite.consumir(_redis(request), device_id)
    if not resultado.permitido:
        log.warning("rate limit excedido", extra={"device_id": str(device_id)})
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "muitos relatos deste aparelho",
            headers={"Retry-After": str(resultado.retry_after_s)},
        )


async def _publicar_relato(request: Request, relato: RelatoRecebido) -> None:
    """Publica `relato.recebido`. O event_id é o próprio client_id: um reenvio do app gera a
    mesma mensagem lógica. Broker fora → 503 (o app mantém na outbox e tenta de novo)."""
    envelope = Envelope(
        event_id=relato.client_id,
        type=EventType.RELATO_RECEBIDO,
        geohash=geohash.encode(relato.latitude, relato.longitude, geohash.CELL_PRECISION),
        payload=relato.model_dump(mode="json"),
    )
    try:
        await messaging.publish(_broker(request).topology.events, envelope)
    except (AMQPError, ConnectionError) as exc:
        log.error("falha ao publicar relato", extra={"client_id": str(relato.client_id)})
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "broker indisponível",
            headers={"Retry-After": "5"},
        ) from exc
    log.info("relato aceito", extra={"client_id": str(relato.client_id)})


@app.get("/health")
async def health() -> dict[str, str]:
    """Liveness: o processo está de pé."""
    return {"status": "ok"}


@app.get("/ready")
async def ready(request: Request) -> dict[str, str]:
    """Readiness: conectado ao broker."""
    if _broker(request).connection.is_closed:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "broker indisponível")
    return {"status": "ok"}


@app.post("/v1/relatos", status_code=status.HTTP_202_ACCEPTED)
async def criar_relato(relato: RelatoIn, request: Request) -> RelatoAceito:
    """Aceita o relato e publica `relato.recebido`. Só responde 202 após o confirm do broker."""
    await _aplicar_limite(request, relato.device_id)
    await _publicar_relato(request, RelatoRecebido(**relato.model_dump()))
    return RelatoAceito(client_id=relato.client_id)


@app.get("/v1/ocorrencias")
async def listar_ocorrencias(
    request: Request,
    bbox: Annotated[str, Query(description="min_lon,min_lat,max_lon,max_lat")],
    tipo: TipoRisco | None = None,
) -> list[OcorrenciaPayload]:
    """Ocorrências ativas no retângulo visível do mapa (cache por célula geohash5)."""
    try:
        min_lon, min_lat, max_lon, max_lat = (float(v) for v in bbox.split(","))
        celulas = leitura.celulas_do_bbox(min_lon, min_lat, max_lon, max_lat)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"bbox inválido: {exc}") from exc
    ocorrencias = await leitura.ocorrencias_por_celulas(_pool(request), _redis(request), celulas)
    return leitura.filtrar(ocorrencias, min_lon, min_lat, max_lon, max_lat, tipo)


@app.get("/v1/ocorrencias/{ocorrencia_id}")
async def detalhar_ocorrencia(ocorrencia_id: int, request: Request) -> OcorrenciaPayload:
    ocorrencia = await leitura.buscar_ocorrencia(_pool(request), ocorrencia_id)
    if ocorrencia is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ocorrência não encontrada")
    return ocorrencia


@app.post("/v1/ocorrencias/{ocorrencia_id}/confirmacoes", status_code=status.HTTP_202_ACCEPTED)
async def confirmar_ocorrencia(
    ocorrencia_id: int, confirmacao: ConfirmacaoIn, request: Request
) -> RelatoAceito:
    """Confirmar = relatar o mesmo tipo e severidade no local da ocorrência; o processor
    agrupa e incrementa as confirmações. 409 se a ocorrência já expirou."""
    ocorrencia = await leitura.buscar_ocorrencia(_pool(request), ocorrencia_id)
    if ocorrencia is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ocorrência não encontrada")
    if ocorrencia.status is StatusOcorrencia.EXPIRADA:
        raise HTTPException(status.HTTP_409_CONFLICT, "ocorrência expirada")
    await _aplicar_limite(request, confirmacao.device_id)
    relato = RelatoRecebido(
        client_id=confirmacao.client_id,
        device_id=confirmacao.device_id,
        tipo=ocorrencia.tipo,
        severidade=ocorrencia.severidade,
        latitude=ocorrencia.latitude,
        longitude=ocorrencia.longitude,
        registrado_em=confirmacao.registrado_em,
    )
    await _publicar_relato(request, relato)
    return RelatoAceito(client_id=confirmacao.client_id)
