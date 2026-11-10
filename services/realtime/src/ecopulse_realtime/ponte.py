"""Ponte RabbitMQ → Redis Cluster (sharded pub/sub).

Uma fila durável COMPARTILHADA entre as instâncias (consumidores concorrentes): cada evento é
repassado ao Redis UMA vez, por qualquer instância, e o Redis entrega a todas as instâncias
que assinam aquela célula. Isso desacopla o nº de instâncias do nº de cópias no broker.

Sem assinante no canal, o SPUBLISH simplesmente não entrega: o app recupera o estado pelo
GET /v1/ocorrencias ao reconectar.
"""

import logging

from aio_pika.abc import AbstractChannel, AbstractExchange
from redis.asyncio.cluster import RedisCluster

from ecopulse_common import messaging
from ecopulse_common.config import Settings
from ecopulse_common.consumer import assinar
from ecopulse_common.events import Envelope, OcorrenciaPayload
from ecopulse_realtime import protocolo

log = logging.getLogger(__name__)

FILA = "realtime.ponte"
BINDING = "ocorrencia.*"


async def iniciar(channel: AbstractChannel, events: AbstractExchange, redis: RedisCluster) -> None:
    """Declara FILA (durável), liga em `events` com BINDING e consome via assinar:
    - corpo → Envelope; tipo precisa ser ocorrencia.*; payload → OcorrenciaPayload;
      monta protocolo.Alerta e faz redis.spublish(protocolo.canal(geohash[:6]), alerta)
    - sucesso → ack
    - evento inválido → retry/DLQ conforme a política do assinar
    - Redis indisponível → transitório: backoff e nack(requeue=True) via assinar
    """

    async def _repassar(envelope: Envelope) -> None:
        if not envelope.type.value.startswith("ocorrencia."):
            raise ValueError(f"tipo inesperado: {envelope.type.value}")
        payload = OcorrenciaPayload.model_validate(envelope.payload)
        alerta = protocolo.Alerta.model_validate(
            {"type": envelope.type.value, "ocorrencia": payload}
        )
        await redis.spublish(protocolo.canal(envelope.geohash[:6]), alerta.model_dump_json())

    dlx = (await messaging.declare_topology(channel, Settings().partitions)).dlx
    await assinar(channel, events, FILA, (BINDING,), _repassar, dlx=dlx)
