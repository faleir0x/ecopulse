import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import asyncpg
import pytest

from ecopulse_common import geohash
from ecopulse_common.events import (
    Envelope,
    EventType,
    OcorrenciaPayload,
    RelatoRecebido,
    ResolucaoRecebida,
    Severidade,
    StatusOcorrencia,
    TipoRisco,
)
from ecopulse_processor.servico import processar_relato, processar_resolucao

pytestmark = pytest.mark.integration

LAT = -23.5505
LON = -46.6333

_CONTAGENS = {
    "resolucoes": "SELECT count(*) FROM resolucoes",
    "outbox": "SELECT count(*) FROM outbox",
}


def _relato_envelope() -> Envelope:
    payload = RelatoRecebido(
        client_id=uuid4(),
        device_id=uuid4(),
        tipo=TipoRisco.ALAGAMENTO,
        severidade=Severidade.ALTO,
        descricao=None,
        latitude=LAT,
        longitude=LON,
        registrado_em=datetime(2026, 11, 7, 12, 0, tzinfo=UTC),
    )
    return Envelope(
        type=EventType.RELATO_RECEBIDO,
        geohash=geohash.encode(LAT, LON, geohash.CELL_PRECISION),
        payload=payload.model_dump(mode="json"),
    )


def _resolucao_envelope(
    ocorrencia_id: int,
    *,
    device_id: UUID | None = None,
    client_id: UUID | None = None,
) -> Envelope:
    payload = ResolucaoRecebida(
        client_id=client_id or uuid4(),
        device_id=device_id or uuid4(),
        ocorrencia_id=ocorrencia_id,
        registrado_em=datetime(2026, 11, 7, 12, 0, tzinfo=UTC),
    )
    return Envelope(
        type=EventType.RESOLUCAO_RECEBIDA,
        geohash=geohash.encode(LAT, LON, geohash.CELL_PRECISION),
        payload=payload.model_dump(mode="json"),
    )


async def _primeira_ocorrencia(pool: asyncpg.Pool) -> asyncpg.Record:
    async with pool.acquire() as conn:
        linha = await conn.fetchrow(
            "SELECT id, confirmacoes, status, resolucoes, encerrada_em FROM ocorrencias ORDER BY id"
        )
    assert linha is not None
    return linha


async def _contar(pool: asyncpg.Pool, tabela: str) -> int:
    async with pool.acquire() as conn:
        return int(await conn.fetchval(_CONTAGENS[tabela]))


async def _eventos(pool: asyncpg.Pool) -> list[tuple[str, dict[str, Any]]]:
    async with pool.acquire() as conn:
        linhas = await conn.fetch("SELECT routing_key, envelope FROM outbox ORDER BY id")
    eventos: list[tuple[str, dict[str, Any]]] = []
    for linha in linhas:
        envelope: dict[str, Any] = json.loads(linha["envelope"])
        eventos.append((str(linha["routing_key"]), envelope))
    return eventos


async def _ocorrencia_atual(pool: asyncpg.Pool, ocorrencia_id: int) -> asyncpg.Record:
    async with pool.acquire() as conn:
        linha = await conn.fetchrow(
            """
            SELECT id, confirmacoes, status, resolucoes, encerrada_em, atualizada_em
            FROM ocorrencias
            WHERE id = $1
            """,
            ocorrencia_id,
        )
    assert linha is not None
    return linha


async def test_uma_confirmacao_e_uma_resolucao_encerra(pool: asyncpg.Pool) -> None:
    await processar_relato(pool, _relato_envelope())
    ocorrencia = await _primeira_ocorrencia(pool)
    assert ocorrencia["confirmacoes"] == 1

    await processar_resolucao(pool, _resolucao_envelope(ocorrencia["id"]))

    atual = await _ocorrencia_atual(pool, ocorrencia["id"])
    assert atual["status"] == StatusOcorrencia.EXPIRADA.value
    assert atual["resolucoes"] == 1
    assert atual["encerrada_em"] is not None

    expirados = [
        OcorrenciaPayload.model_validate(dados["payload"])
        for routing_key, dados in await _eventos(pool)
        if routing_key == EventType.OCORRENCIA_EXPIRADA.value
    ]
    assert len(expirados) == 1
    assert expirados[0].id == ocorrencia["id"]
    assert expirados[0].resolucoes == 1
    assert expirados[0].encerrada_em is not None


async def test_cinco_confirmacoes_precisam_de_tres_resolucoes(pool: asyncpg.Pool) -> None:
    for _ in range(5):
        await processar_relato(pool, _relato_envelope())

    ocorrencia = await _primeira_ocorrencia(pool)
    assert ocorrencia["confirmacoes"] == 5

    for numero, _ in enumerate(range(2), start=1):
        await processar_resolucao(pool, _resolucao_envelope(ocorrencia["id"]))
        atual = await _ocorrencia_atual(pool, ocorrencia["id"])
        routing_key, dados = (await _eventos(pool))[-1]
        payload = OcorrenciaPayload.model_validate(dados["payload"])
        assert atual["status"] == StatusOcorrencia.ATIVA.value
        assert atual["resolucoes"] == numero
        assert routing_key == EventType.OCORRENCIA_ATUALIZADA.value
        assert payload.resolucoes == numero

    await processar_resolucao(pool, _resolucao_envelope(ocorrencia["id"]))

    atual = await _ocorrencia_atual(pool, ocorrencia["id"])
    routing_key, dados = (await _eventos(pool))[-1]
    payload = OcorrenciaPayload.model_validate(dados["payload"])
    assert atual["status"] == StatusOcorrencia.EXPIRADA.value
    assert atual["resolucoes"] == 3
    assert atual["encerrada_em"] is not None
    assert routing_key == EventType.OCORRENCIA_EXPIRADA.value
    assert payload.resolucoes == 3


async def test_mesmo_aparelho_conta_uma_vez(pool: asyncpg.Pool) -> None:
    for _ in range(2):
        await processar_relato(pool, _relato_envelope())

    ocorrencia = await _primeira_ocorrencia(pool)
    assert ocorrencia["confirmacoes"] == 2
    device_id = uuid4()

    await processar_resolucao(pool, _resolucao_envelope(ocorrencia["id"], device_id=device_id))
    eventos_apos_primeira = await _contar(pool, "outbox")

    await processar_resolucao(pool, _resolucao_envelope(ocorrencia["id"], device_id=device_id))

    atual = await _ocorrencia_atual(pool, ocorrencia["id"])
    assert atual["status"] == StatusOcorrencia.ATIVA.value
    assert atual["resolucoes"] == 1
    assert await _contar(pool, "resolucoes") == 1
    assert await _contar(pool, "outbox") == eventos_apos_primeira


async def test_resolucao_em_ocorrencia_encerrada_nao_muda_nada(pool: asyncpg.Pool) -> None:
    await processar_relato(pool, _relato_envelope())
    ocorrencia = await _primeira_ocorrencia(pool)

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE ocorrencias SET status = 'expirada', encerrada_em = now() WHERE id = $1",
            ocorrencia["id"],
        )

    antes = dict(await _ocorrencia_atual(pool, ocorrencia["id"]))
    outbox_antes = await _contar(pool, "outbox")

    await processar_resolucao(pool, _resolucao_envelope(ocorrencia["id"]))

    depois = dict(await _ocorrencia_atual(pool, ocorrencia["id"]))
    assert depois == antes
    assert await _contar(pool, "outbox") == outbox_antes
    assert await _contar(pool, "resolucoes") == 0
