"""Invalida o cache de leitura quando uma ocorrência muda.

Fila durável compartilhada entre as réplicas da API (consumidores concorrentes): basta UMA
réplica apagar a chave, porque o Redis é compartilhado.
Usa ecopulse_common.consumer.assinar: corpo inválido e erros permanentes vão para a DLQ.
Se a invalidação falhar por Redis indisponível, loga e faz ack — o TTL do cache limita a
defasagem, então não adianta reter a fila esperando o Redis voltar.
"""

import logging

from aio_pika.abc import AbstractChannel, AbstractExchange
from redis.asyncio.cluster import RedisCluster
from redis.exceptions import RedisError

from ecopulse_api import leitura
from ecopulse_common import messaging
from ecopulse_common.config import Settings
from ecopulse_common.consumer import assinar
from ecopulse_common.events import Envelope

log = logging.getLogger(__name__)

FILA = "api.cache.invalidacao"
BINDING = "ocorrencia.*"


async def iniciar(channel: AbstractChannel, events: AbstractExchange, redis: RedisCluster) -> None:
    """Declara FILA (durável), liga em `events` com BINDING e consome via assinar:
    corpo → Envelope → redis.delete(leitura.chave_celula(geohash[:5])).
    RedisError é tratado dentro do handler (loga e deixa o assinar fazer ack, pois o TTL
    limita a defasagem). Os demais erros seguem a política do assinar (retry/DLQ)."""

    async def _invalidar(envelope: Envelope) -> None:
        event_id = str(envelope.event_id)
        try:
            await redis.delete(leitura.chave_celula(envelope.geohash[:5]))
        except RedisError as exc:
            log.warning(
                "falha ao invalidar cache de ocorrência",
                extra={"event_id": event_id, "error": f"{type(exc).__name__}: {exc}"},
            )

    dlx = (await messaging.declare_topology(channel, Settings().partitions)).dlx
    await assinar(channel, events, FILA, (BINDING,), _invalidar, dlx=dlx)
