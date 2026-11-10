"""Conta a presença dos aparelhos (evento telemetria.aparelho) no Redis Cluster.

O sinal já chega com só a célula geohash6: a coordenada exata nunca passa pelo broker. O
handler descarta sinal velho (fora da janela de presença) e usa o relógio do servidor quando
o horário do aparelho está no futuro, para um relógio adiantado não manter presença eterna.
"""

import logging
import time

from aio_pika.abc import AbstractChannel, AbstractExchange
from redis.asyncio.cluster import RedisCluster

from ecopulse_common import messaging
from ecopulse_common.config import Settings
from ecopulse_common.consumer import assinar
from ecopulse_common.events import Envelope, TelemetriaAparelho
from ecopulse_common.telemetria import JANELA_PRESENCA_S, registrar_presenca

FILA = "processor.telemetria"
BINDING = "telemetria.aparelho"

# Tolerância para relógio adiantado no aparelho: acima disso, vale o horário do servidor
FUTURO_MAXIMO_S = 5 * 60

log = logging.getLogger(__name__)


async def iniciar(channel: AbstractChannel, events: AbstractExchange, redis: RedisCluster) -> None:
    """Declara FILA (durável), liga em `events` com BINDING e consome via assinar:
    corpo → Envelope → TelemetriaAparelho.model_validate(payload) → registrar_presenca → ack.
    Sinal mais antigo que a janela de presença é descartado; sinal no futuro além da tolerância
    é registrado com o horário do servidor. Redis fora do ar é transitório (backoff e requeue)."""

    async def _processar(envelope: Envelope) -> None:
        payload = TelemetriaAparelho.model_validate(envelope.payload)
        agora_s = time.time()
        registrado_s = payload.registrado_em.timestamp()

        if registrado_s < agora_s - JANELA_PRESENCA_S:
            log.debug(
                "sinal de telemetria velho descartado",
                extra={"device_id": str(payload.device_id), "geohash": payload.geohash},
            )
            return
        if registrado_s > agora_s + FUTURO_MAXIMO_S:
            registrado_s = agora_s

        await registrar_presenca(redis, payload.geohash, str(payload.device_id), registrado_s)

    dlx = (await messaging.declare_topology(channel, Settings().partitions)).dlx
    await assinar(channel, events, FILA, (BINDING,), _processar, dlx=dlx)
