"""Invalida o cache de leitura quando uma ocorrência muda.

Fila durável compartilhada entre as réplicas da API (consumidores concorrentes): basta UMA
réplica apagar a chave, porque o Redis é compartilhado.
Não usa ecopulse_common.consumer: as filas de retry de lá devolvem ao exchange de relatos.
Se a invalidação falhar, loga e faz ack — o TTL do cache limita a defasagem.
"""

import logging

from aio_pika.abc import AbstractChannel, AbstractExchange, AbstractIncomingMessage
from redis.asyncio.cluster import RedisCluster
from redis.exceptions import RedisError

from ecopulse_api import leitura
from ecopulse_common import messaging
from ecopulse_common.events import Envelope

log = logging.getLogger(__name__)

FILA = "api.cache.invalidacao"
BINDING = "ocorrencia.*"


async def iniciar(channel: AbstractChannel, events: AbstractExchange, redis: RedisCluster) -> None:
    """Declara FILA (durável), liga em `events` com BINDING e consome (sem auto-ack):
    corpo → Envelope.model_validate_json → redis.delete(leitura.chave_celula(geohash[:5])).
    Sempre faz ack ao final; erros (corpo inválido, RedisError) só geram log de warning."""

    async def _invalidar(message: AbstractIncomingMessage) -> None:
        event_id: str | None = None
        try:
            envelope = Envelope.model_validate_json(message.body)
            event_id = str(envelope.event_id)
            await redis.delete(leitura.chave_celula(envelope.geohash[:5]))
        except (TypeError, ValueError, RedisError) as exc:
            log.warning(
                "falha ao invalidar cache de ocorrência",
                extra={"event_id": event_id, "error": f"{type(exc).__name__}: {exc}"},
            )
        finally:
            await message.ack()

    fila = await channel.declare_queue(FILA, durable=True, arguments=messaging.QUORUM)
    await fila.bind(events, routing_key=BINDING)
    await fila.consume(_invalidar, no_ack=False)
