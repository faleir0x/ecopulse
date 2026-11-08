"""Casos de uso do processor: cada um abre UMA transação."""

import logging

import asyncpg
from pydantic import ValidationError

from ecopulse_common import geohash
from ecopulse_common.consumer import PermanentError
from ecopulse_common.events import (
    Envelope,
    EventType,
    RelatoRecebido,
    ResolucaoRecebida,
    StatusOcorrencia,
)
from ecopulse_processor import regras, repositorio

log = logging.getLogger(__name__)


async def processar_relato(pool: asyncpg.Pool, envelope: Envelope) -> None:
    """Handler de `relato.recebido` (idempotente).

    1. Valida envelope.payload como RelatoRecebido; ValidationError → PermanentError.
    2. Numa transação:
       a. travar_regiao(f"{tipo}:{envelope.geohash[:5]}")
       b. inserir_relato; se duplicata → retorna sem fazer mais nada
       c. ocorrencia_proxima(RAIO_AGRUPAMENTO_M); se existe → confirmar_ocorrencia (evento
          OCORRENCIA_ATUALIZADA), senão criar_ocorrencia (evento OCORRENCIA_CRIADA)
       d. vincular_relato
       e. enfileirar_evento com Envelope(type=..., geohash=ocorrencia.geohash,
          payload=ocorrencia.model_dump(mode="json"))
    3. asyncpg.exceptions.IntegrityConstraintViolationError e DataError → PermanentError.
       Outras exceções sobem (o consumidor faz retry).
    Validade por tipo em regras.VALIDADE.
    """
    try:
        relato = RelatoRecebido.model_validate(envelope.payload)
    except ValidationError as exc:
        raise PermanentError(f"payload de relato inválido: {exc}") from exc

    celula = geohash.encode(relato.latitude, relato.longitude, geohash.CELL_PRECISION)
    validade = regras.VALIDADE[relato.tipo]

    try:
        async with pool.acquire() as conn, conn.transaction():
            await repositorio.travar_regiao(conn, f"{relato.tipo.value}:{envelope.geohash[:5]}")

            relato_id = await repositorio.inserir_relato(conn, relato, celula)
            if relato_id is None:
                log.info(
                    "relato duplicado ignorado",
                    extra={
                        "event_id": str(envelope.event_id),
                        "client_id": str(relato.client_id),
                    },
                )
                return

            ocorrencia_id = await repositorio.ocorrencia_proxima(
                conn, relato, regras.RAIO_AGRUPAMENTO_M
            )
            if ocorrencia_id is None:
                ocorrencia = await repositorio.criar_ocorrencia(conn, relato, celula, validade)
                tipo_evento = EventType.OCORRENCIA_CRIADA
            else:
                ocorrencia = await repositorio.confirmar_ocorrencia(
                    conn, ocorrencia_id, relato.severidade, validade
                )
                tipo_evento = EventType.OCORRENCIA_ATUALIZADA

            await repositorio.vincular_relato(conn, relato_id, ocorrencia.id)
            await repositorio.enfileirar_evento(
                conn,
                Envelope(
                    type=tipo_evento,
                    geohash=ocorrencia.geohash,
                    payload=ocorrencia.model_dump(mode="json"),
                ),
            )
    except (
        asyncpg.exceptions.IntegrityConstraintViolationError,
        asyncpg.exceptions.DataError,
    ) as exc:
        raise PermanentError(f"relato rejeitado pelo banco: {exc}") from exc


async def processar_resolucao(pool: asyncpg.Pool, envelope: Envelope) -> None:
    """Handler de `resolucao.recebida` (idempotente).

    Uma transação: trava a ocorrência; se não existe ou não está ativa, ignora. Insere a
    resolução (ON CONFLICT DO NOTHING cobre reenvio e o mesmo aparelho votando de novo).
    Se as resoluções chegarem a `regras.resolucoes_para_encerrar(confirmacoes)`, encerra a
    ocorrência e enfileira OCORRENCIA_EXPIRADA; senão, OCORRENCIA_ATUALIZADA.
    """
    try:
        resolucao = ResolucaoRecebida.model_validate(envelope.payload)
    except ValidationError as exc:
        raise PermanentError(f"payload de resolução inválido: {exc}") from exc

    try:
        async with pool.acquire() as conn, conn.transaction():
            ocorrencia = await repositorio.travar_ocorrencia(conn, resolucao.ocorrencia_id)
            if ocorrencia is None:
                log.info(
                    "resolução para ocorrência inexistente ignorada",
                    extra={"event_id": str(envelope.event_id)},
                )
                return
            if ocorrencia.status is not StatusOcorrencia.ATIVA:
                log.info(
                    "resolução para ocorrência encerrada ignorada",
                    extra={
                        "event_id": str(envelope.event_id),
                        "ocorrencia_id": ocorrencia.id,
                    },
                )
                return

            resolucao_id = await repositorio.inserir_resolucao(conn, resolucao)
            if resolucao_id is None:
                log.info(
                    "resolução duplicada ignorada",
                    extra={
                        "event_id": str(envelope.event_id),
                        "client_id": str(resolucao.client_id),
                    },
                )
                return

            encerrar = ocorrencia.resolucoes + 1 >= regras.resolucoes_para_encerrar(
                ocorrencia.confirmacoes
            )
            atualizada = await repositorio.registrar_resolucao(
                conn, ocorrencia.id, encerrar=encerrar
            )
            await repositorio.enfileirar_evento(
                conn,
                Envelope(
                    type=(
                        EventType.OCORRENCIA_EXPIRADA
                        if encerrar
                        else EventType.OCORRENCIA_ATUALIZADA
                    ),
                    geohash=atualizada.geohash,
                    payload=atualizada.model_dump(mode="json"),
                ),
            )
    except (
        asyncpg.exceptions.IntegrityConstraintViolationError,
        asyncpg.exceptions.DataError,
    ) as exc:
        raise PermanentError(f"resolução rejeitada pelo banco: {exc}") from exc


async def expirar_ocorrencias(pool: asyncpg.Pool) -> int:
    """Uma transação: expirar_vencidas + um evento OCORRENCIA_EXPIRADA na outbox para cada.
    Retorna quantas expiraram. Seguro com várias réplicas rodando ao mesmo tempo."""
    async with pool.acquire() as conn, conn.transaction():
        expiradas = await repositorio.expirar_vencidas(conn)
        for ocorrencia in expiradas:
            await repositorio.enfileirar_evento(
                conn,
                Envelope(
                    type=EventType.OCORRENCIA_EXPIRADA,
                    geohash=ocorrencia.geohash,
                    payload=ocorrencia.model_dump(mode="json"),
                ),
            )
    if expiradas:
        log.info("ocorrências expiradas", extra={"total": len(expiradas)})
    return len(expiradas)
