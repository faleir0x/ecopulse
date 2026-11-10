"""Regra do push: quem avisar, sem repetir, e o que fazer com cada resposta do FCM."""

import asyncio
import logging
from datetime import datetime
from typing import Any

import asyncpg
from redis.asyncio.cluster import RedisCluster

from ecopulse_common import ordem
from ecopulse_common.events import (
    Envelope,
    EventType,
    OcorrenciaPayload,
    StatusOcorrencia,
)
from ecopulse_notifier import mensagem, repositorio
from ecopulse_notifier.fcm import Enviador, ErroFcm, ErroPermanente, TokenInvalido

log = logging.getLogger(__name__)

# Tentativas por aparelho em falha transitória do FCM, com estas esperas entre elas
ESPERAS_S: tuple[float, ...] = (0.5, 2.0)
# Pushes simultâneos no máximo (o fan-out não pode estourar o timeout do consumidor)
ENVIOS_SIMULTANEOS = 20
# Marca provisória enquanto o push está em andamento: se o processo cair, ela expira sozinha
MARCA_EM_ANDAMENTO_S = 120
# Mínimo de vida da marca de "já avisado" (ocorrência que expira logo)
TTL_MINIMO_S = 60
# Folga da marca depois do expira_em da ocorrência (confirmada, a validade se estende)
FOLGA_TTL_S = 3600

_EVENTOS_DE_OCORRENCIA = (EventType.OCORRENCIA_CRIADA, EventType.OCORRENCIA_ATUALIZADA)


def chave_enviado(ocorrencia_id: int, severidade: str, aparelho_id: str) -> str:
    """Marca de "já avisado" no Redis Cluster: uma por ocorrência, severidade e aparelho."""
    return f"push:{ocorrencia_id}:{severidade}:{aparelho_id}"


async def _enviar_com_tentativas(enviador: Enviador, mensagem_fcm: dict[str, Any]) -> None:
    """Tenta enviar; em ErroFcm espera ESPERAS_S[i] entre as tentativas. Levanta o último."""
    for tentativa in range(len(ESPERAS_S) + 1):
        try:
            await enviador.enviar(mensagem_fcm)
            return
        except ErroFcm:
            if tentativa == len(ESPERAS_S):
                raise
            await asyncio.sleep(ESPERAS_S[tentativa])


async def _enviar_destino(
    destino: repositorio.Destino,
    ocorrencia: OcorrenciaPayload,
    pool: asyncpg.Pool,
    redis: RedisCluster,
    enviador: Enviador,
    ttl: int,
    semaforo: asyncio.Semaphore,
) -> bool:
    """Marca, envia e atualiza a marca de um aparelho; True se o push saiu."""
    chave = chave_enviado(ocorrencia.id, ocorrencia.severidade.value, str(destino.aparelho_id))
    async with semaforo:
        # Marca provisória: duas entregas do mesmo evento não mandam em dobro. Se o processo
        # cair no meio, o TTL curto libera o aparelho para um próximo evento.
        if not await redis.set(chave, "1", nx=True, ex=MARCA_EM_ANDAMENTO_S):
            return False

        conteudo = mensagem.montar(ocorrencia, destino.token, destino.distancia_m)
        try:
            await _enviar_com_tentativas(enviador, conteudo)
        except TokenInvalido as exc:
            log.info(
                "token inválido; aparelho removido",
                extra={
                    "ocorrencia_id": ocorrencia.id,
                    "aparelho_id": str(destino.aparelho_id),
                    "error": type(exc).__name__,
                },
            )
            await repositorio.remover_token(pool, destino.token)
            await redis.delete(chave)
        except (ErroFcm, ErroPermanente) as exc:
            log.warning(
                "falha ao enviar push",
                extra={
                    "ocorrencia_id": ocorrencia.id,
                    "aparelho_id": str(destino.aparelho_id),
                    "error": f"{type(exc).__name__}: {exc}",
                },
            )
            await redis.delete(chave)
        else:
            # Só depois do sucesso a marca passa a valer pelo prazo final da ocorrência
            await redis.set(chave, "1", ex=ttl)
            return True
        return False


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
    - para cada repositorio.destinos(...): SET chave_enviado NX EX MARCA_EM_ANDAMENTO_S;
      se já existia, pula (a mesma severidade não avisa de novo, uma piora sim, e um
      reenvio da mesma mensagem pelo RabbitMQ não duplica)
    - envia mensagem.montar(...) pelo enviador, com até len(ESPERAS_S) novas tentativas em
      ErroFcm (asyncio.sleep(ESPERAS_S[i]) entre elas), com no máximo ENVIOS_SIMULTANEOS
      aparelhos ao mesmo tempo
    - sucesso → SET da mesma marca com o TTL final, max(TTL_MINIMO_S, segundos até o
      expira_em atual + FOLGA_TTL_S)
    - TokenInvalido → repositorio.remover_token e apaga a marca
    - ErroFcm esgotado ou ErroPermanente → loga warning (sem o token) e apaga a marca, para
      que um próximo evento da ocorrência possa tentar de novo
    - RedisError e erros do banco sobem para o chamador (a mensagem volta para a fila)
    """
    if envelope.type not in _EVENTOS_DE_OCORRENCIA:
        return 0

    ocorrencia = OcorrenciaPayload.model_validate(envelope.payload)
    if not await ordem.versao_atual(redis, "notifier", ocorrencia.id, ocorrencia.versao):
        log.debug(
            "evento antigo descartado",
            extra={"ocorrencia_id": ocorrencia.id, "versao": ocorrencia.versao},
        )
        return 0
    if ocorrencia.status is not StatusOcorrencia.ATIVA:
        return 0

    # Recalculado a cada evento: uma confirmação estende expira_em e a marca acompanha
    ttl = max(
        TTL_MINIMO_S,
        int((ocorrencia.expira_em - agora).total_seconds()) + FOLGA_TTL_S,
    )
    semaforo = asyncio.Semaphore(ENVIOS_SIMULTANEOS)
    destinos = await repositorio.destinos(pool, ocorrencia, agora)
    resultados = await asyncio.gather(
        *(
            _enviar_destino(destino, ocorrencia, pool, redis, enviador, ttl, semaforo)
            for destino in destinos
        )
    )
    return sum(resultados)
