"""Regra do push: quem avisar, sem repetir, e o que fazer com cada resposta do FCM."""

import logging
from datetime import datetime

import asyncpg
from redis.asyncio.cluster import RedisCluster

from ecopulse_common.events import Envelope
from ecopulse_notifier.fcm import Enviador

log = logging.getLogger(__name__)

# Tentativas por aparelho em falha transitória do FCM, com estas esperas entre elas
ESPERAS_S: tuple[float, ...] = (0.5, 2.0)
# Mínimo de vida da marca de "já avisado" (ocorrência que expira logo)
TTL_MINIMO_S = 60


def chave_enviado(ocorrencia_id: int, severidade: str, aparelho_id: str) -> str:
    """Marca de "já avisado" no Redis Cluster: uma por ocorrência, severidade e aparelho."""
    return f"push:{ocorrencia_id}:{severidade}:{aparelho_id}"


async def notificar(
    envelope: Envelope,
    pool: asyncpg.Pool,
    redis: RedisCluster,
    enviador: Enviador,
    agora: datetime,
) -> int:
    """Processa um ocorrencia.criada/.atualizada e devolve quantos pushes foram enviados.

    - outro tipo de evento, ou ocorrência com status diferente de "ativa" → 0
    - payload → OcorrenciaPayload (ValueError/ValidationError sobe para o chamador)
    - para cada repositorio.destinos(...): SET chave_enviado NX EX (segundos até expira_em,
      no mínimo TTL_MINIMO_S); se já existia, pula (a mesma severidade não avisa de novo,
      uma piora sim, e um reenvio da mesma mensagem pelo RabbitMQ não duplica)
    - envia mensagem.montar(...) pelo enviador, com até len(ESPERAS_S) novas tentativas em
      ErroFcm (asyncio.sleep(ESPERAS_S[i]) entre elas)
    - TokenInvalido → repositorio.remover_token e apaga a marca
    - ErroFcm esgotado ou ErroPermanente → loga warning (sem o token) e apaga a marca, para
      que um próximo evento da ocorrência possa tentar de novo; segue para o próximo aparelho
    - RedisError e erros do banco sobem para o chamador (a mensagem volta para a fila)
    """
    # TODO(worker)
    raise NotImplementedError
