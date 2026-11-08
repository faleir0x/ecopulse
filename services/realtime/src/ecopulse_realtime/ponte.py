"""Ponte RabbitMQ → Redis Cluster (sharded pub/sub).

Uma fila durável COMPARTILHADA entre as instâncias (consumidores concorrentes): cada evento é
repassado ao Redis UMA vez, por qualquer instância, e o Redis entrega a todas as instâncias
que assinam aquela célula. Isso desacopla o nº de instâncias do nº de cópias no broker.

Sem assinante no canal, o SPUBLISH simplesmente não entrega: o app recupera o estado pelo
GET /v1/ocorrencias ao reconectar.
"""

import asyncio
import logging

from aio_pika.abc import AbstractChannel, AbstractExchange, AbstractIncomingMessage
from redis.asyncio.cluster import RedisCluster
from redis.exceptions import RedisError

from ecopulse_common import messaging
from ecopulse_common.events import Envelope, OcorrenciaPayload
from ecopulse_realtime import protocolo

log = logging.getLogger(__name__)

FILA = "realtime.ponte"
BINDING = "ocorrencia.*"


async def iniciar(channel: AbstractChannel, events: AbstractExchange, redis: RedisCluster) -> None:
    """Declara FILA (durável), liga em `events` com BINDING e consome (sem auto-ack, prefetch
    já definido no canal pelo chamador):
    - corpo → Envelope.model_validate_json; tipo precisa ser ocorrencia.*; payload →
      OcorrenciaPayload; monta protocolo.Alerta e faz
      redis.spublish(protocolo.canal(envelope.geohash[:6]), alerta.model_dump_json())
    - sucesso → ack
    - corpo inválido → loga warning e ack (descarta; não adianta repetir)
    - RedisError → loga warning, espera 1 s e nack(requeue=True)
    """

    async def _repassar(message: AbstractIncomingMessage) -> None:
        event_id: str | None = None
        try:
            envelope = Envelope.model_validate_json(message.body)
            event_id = str(envelope.event_id)
            if not envelope.type.value.startswith("ocorrencia."):
                raise ValueError(f"tipo inesperado: {envelope.type.value}")
            payload = OcorrenciaPayload.model_validate(envelope.payload)
            alerta = protocolo.Alerta.model_validate(
                {"type": envelope.type.value, "ocorrencia": payload}
            )
            await redis.spublish(protocolo.canal(envelope.geohash[:6]), alerta.model_dump_json())
        except (TypeError, ValueError) as exc:
            log.warning(
                "evento inválido descartado na ponte",
                extra={"event_id": event_id, "error": f"{type(exc).__name__}: {exc}"},
            )
            await message.ack()
        except RedisError as exc:
            log.warning(
                "falha ao repassar evento para o Redis",
                extra={"event_id": event_id, "error": f"{type(exc).__name__}: {exc}"},
            )
            await asyncio.sleep(1)
            await message.nack(requeue=True)
        else:
            await message.ack()

    fila = await channel.declare_queue(FILA, durable=True, arguments=messaging.QUORUM)
    await fila.bind(events, routing_key=BINDING)
    await fila.consume(_repassar, no_ack=False)
