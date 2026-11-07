"""Invalida o cache de leitura quando uma ocorrência muda.

Fila durável compartilhada entre as réplicas da API (consumidores concorrentes): basta UMA
réplica apagar a chave, porque o Redis é compartilhado.
Não usa ecopulse_common.consumer: as filas de retry de lá devolvem ao exchange de relatos.
Se a invalidação falhar, loga e faz ack — o TTL do cache limita a defasagem.
"""

from aio_pika.abc import AbstractChannel, AbstractExchange
from redis.asyncio.cluster import RedisCluster

FILA = "api.cache.invalidacao"
BINDING = "ocorrencia.*"


async def iniciar(channel: AbstractChannel, events: AbstractExchange, redis: RedisCluster) -> None:
    """Declara FILA (durável), liga em `events` com BINDING e consome (sem auto-ack):
    corpo → Envelope.model_validate_json → redis.delete(leitura.chave_celula(geohash[:5])).
    Sempre faz ack ao final; erros (corpo inválido, RedisError) só geram log de warning."""
    raise NotImplementedError  # TODO(worker)
