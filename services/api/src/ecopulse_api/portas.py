"""Portas da API: publicação de eventos e rate limit.

Em produção os adaptadores usam RabbitMQ e o Redis Cluster; os testes trocam as portas por
dublês via ``app.dependency_overrides``. Os endpoints dependem só destas interfaces, então
mudar o armazenamento do broker ou o script Lua do limitador não afeta os testes de contrato.
"""

import asyncio
from typing import Protocol
from uuid import UUID

from fastapi import Request
from redis.asyncio.cluster import RedisCluster

from ecopulse_api import limite
from ecopulse_common import messaging
from ecopulse_common.events import Envelope
from ecopulse_common.messaging import Topology

# Publisher confirm sem prazo pendura a requisição com o broker em alarme de memória.
TIMEOUT_PUBLICACAO_S = 5


class Publicador(Protocol):
    """Porta de publicação de eventos."""

    async def publicar(self, envelope: Envelope) -> None:
        """Publica o envelope e aguarda o publisher confirm."""
        ...


class Limitador(Protocol):
    """Porta de rate limit por balde e chave."""

    async def consumir(self, balde: str, chave: str) -> limite.Resultado:
        """Tenta gastar 1 token do `balde` para a `chave`."""
        ...


class PublicadorRabbit:
    """Adaptador de produção: publica no exchange de eventos do RabbitMQ."""

    def __init__(self, topology: Topology) -> None:
        self._topology = topology

    async def publicar(self, envelope: Envelope) -> None:
        async with asyncio.timeout(TIMEOUT_PUBLICACAO_S):
            await messaging.publish(self._topology.events, envelope)


class LimitadorRedis:
    """Adaptador de produção: token bucket no Redis Cluster (funções de `limite.py`)."""

    def __init__(self, redis: RedisCluster) -> None:
        self._redis = redis

    async def consumir(self, balde: str, chave: str) -> limite.Resultado:
        match balde:
            case "relato":
                return await limite.consumir(self._redis, UUID(chave))
            case "ip":
                return await limite.consumir_ip(self._redis, chave)
            case "voto":
                return await limite.consumir_voto(self._redis, chave)
            case "ambiente":
                return await limite.consumir_ambiente(self._redis, chave)
            case "rota":
                return await limite.consumir_rota(self._redis, chave)
            case "local":
                return await limite.consumir_local(self._redis, chave)
            case "aparelho":
                return await limite.consumir_aparelho(self._redis, chave)
            case "telemetria":
                return await limite.consumir_telemetria(self._redis, chave)
            case _:
                raise ValueError(f"balde desconhecido: {balde}")


def publicador(request: Request) -> Publicador:
    """Dependência do FastAPI; testes podem sobrescrever com app.dependency_overrides."""
    topology: Topology = request.app.state.broker.topology
    return PublicadorRabbit(topology)


def limitador(request: Request) -> Limitador:
    """Dependência do FastAPI; testes podem sobrescrever com app.dependency_overrides."""
    redis: RedisCluster = request.app.state.redis
    return LimitadorRedis(redis)
