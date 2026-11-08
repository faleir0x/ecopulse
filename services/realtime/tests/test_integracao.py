import asyncio
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import aio_pika
import pytest
from aio_pika.abc import AbstractRobustConnection
from fastapi.testclient import TestClient
from redis.asyncio.cluster import ClusterPubSub, RedisCluster

from ecopulse_common import geohash, messaging
from ecopulse_common.events import (
    Envelope,
    EventType,
    OcorrenciaPayload,
    Severidade,
    StatusOcorrencia,
    TipoRisco,
)
from ecopulse_realtime import ponte, protocolo

pytestmark = pytest.mark.integration

LATITUDE = 38.72
LONGITUDE = -9.14


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


def _envelope(payload: OcorrenciaPayload) -> Envelope:
    return Envelope(
        type=EventType.OCORRENCIA_CRIADA,
        geohash=payload.geohash,
        payload=payload.model_dump(mode="json"),
    )


async def _receber_alerta(pubsub: ClusterPubSub, ocorrencia_id: int) -> protocolo.Alerta:
    limite = asyncio.get_running_loop().time() + 5.0
    while asyncio.get_running_loop().time() < limite:
        mensagem = await pubsub.get_sharded_message(ignore_subscribe_messages=True, timeout=1.0)
        if mensagem is None:
            continue
        alerta = protocolo.Alerta.model_validate_json(mensagem["data"])
        if alerta.ocorrencia.id == ocorrencia_id:
            return alerta
    raise AssertionError(f"alerta da ocorrência {ocorrencia_id} não chegou em 5 s")


async def test_ponte_repassa_evento_para_o_canal_sharded(
    rabbit: AbstractRobustConnection, redis: RedisCluster
) -> None:
    celula = geohash.encode(LATITUDE, LONGITUDE, geohash.CELL_PRECISION)
    pubsub = redis.pubsub()
    await pubsub.ssubscribe(protocolo.canal(celula))
    channel = await rabbit.channel()
    try:
        events = await channel.declare_exchange(
            messaging.EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
        )
        await ponte.iniciar(channel, events, redis)

        payload = _payload(LATITUDE, LONGITUDE)
        await messaging.publish(events, _envelope(payload))

        alerta = await _receber_alerta(pubsub, payload.id)
        assert alerta.type == EventType.OCORRENCIA_CRIADA.value
        assert alerta.ocorrencia == payload
    finally:
        await pubsub.aclose()


async def test_websocket_fim_a_fim(cliente: TestClient, rabbit: AbstractRobustConnection) -> None:
    latitude, longitude = 38.73, -9.13
    celula = geohash.encode(latitude, longitude, geohash.CELL_PRECISION)
    payload = _payload(latitude, longitude)
    payload_outra = _payload(38.75, -9.20)

    channel = await rabbit.channel()
    events = await channel.declare_exchange(
        messaging.EVENTS_EXCHANGE, aio_pika.ExchangeType.TOPIC, durable=True
    )

    with cliente.websocket_connect("/v1/ws") as websocket:
        websocket.send_json({"op": "subscribe", "cells": [celula]})
        assert websocket.receive_json() == {"type": "subscribed", "cells": [celula]}

        await messaging.publish(events, _envelope(payload))
        recebido = websocket.receive_json()
        assert recebido["type"] == EventType.OCORRENCIA_CRIADA.value
        assert recebido["ocorrencia"]["id"] == payload.id
        assert recebido["ocorrencia"]["geohash"] == celula

        await messaging.publish(events, _envelope(payload_outra))
        await asyncio.sleep(1.0)
        websocket.send_json({"op": "ping"})
        assert websocket.receive_json() == {"type": "pong"}

        websocket.send_text("isto não é json")
        assert websocket.receive_json()["type"] == "erro"

        websocket.send_json({"op": "subscribe", "cells": ["invalida"]})
        assert websocket.receive_json()["type"] == "erro"

        websocket.send_json({"op": "ping"})
        assert websocket.receive_json() == {"type": "pong"}
