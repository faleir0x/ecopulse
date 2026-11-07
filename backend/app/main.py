import json
from contextlib import asynccontextmanager

import aio_pika
from fastapi import FastAPI

from app import messaging
from app.schemas import RelatoIn


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.connection = await messaging.connect()
    app.state.channel = await app.state.connection.channel()
    app.state.exchange = await messaging.declare_topology(app.state.channel)
    yield
    await app.state.connection.close()


app = FastAPI(title="EcoPulse API", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/relatos", status_code=202)
async def criar_relato(relato: RelatoIn):
    corpo = relato.model_dump(mode="json")
    mensagem = aio_pika.Message(
        body=json.dumps(corpo).encode(),
        content_type="application/json",
        delivery_mode=aio_pika.DeliveryMode.PERSISTENT,   # sobrevive a reinício do broker
    )
    await app.state.exchange.publish(mensagem, routing_key=messaging.QUEUE)
    return {"status": "aceito", "client_id": corpo["client_id"]}
