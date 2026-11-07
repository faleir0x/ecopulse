import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass

from aio_pika.abc import AbstractRobustConnection
from aio_pika.exceptions import AMQPError
from fastapi import FastAPI, HTTPException, Request, status

from ecopulse_api.schemas import RelatoAceito, RelatoIn
from ecopulse_common import geohash, messaging
from ecopulse_common.config import Settings
from ecopulse_common.events import Envelope, EventType, RelatoRecebido
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
    channel = await connection.channel(publisher_confirms=True)
    topology = await messaging.declare_topology(channel, settings.partitions)
    app.state.broker = Broker(connection, topology)
    yield
    await connection.close()


app = FastAPI(title="EcoPulse API", version="0.1.0", lifespan=lifespan)


def _broker(request: Request) -> Broker:
    broker: Broker = request.app.state.broker
    return broker


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
    """Aceita o relato e publica `relato.recebido`. Só responde 202 após o confirm do broker.

    O event_id é o próprio client_id: um reenvio do app gera a mesma mensagem lógica.
    """
    payload = RelatoRecebido(**relato.model_dump())
    envelope = Envelope(
        event_id=relato.client_id,
        type=EventType.RELATO_RECEBIDO,
        geohash=geohash.encode(relato.latitude, relato.longitude, geohash.CELL_PRECISION),
        payload=payload.model_dump(mode="json"),
    )
    try:
        await messaging.publish(_broker(request).topology.events, envelope)
    except (AMQPError, ConnectionError) as exc:
        log.error("falha ao publicar relato", extra={"client_id": str(relato.client_id)})
        # O app mantém o relato na outbox e tenta de novo
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "broker indisponível",
            headers={"Retry-After": "5"},
        ) from exc
    log.info("relato aceito", extra={"client_id": str(relato.client_id)})
    return RelatoAceito(client_id=relato.client_id)
