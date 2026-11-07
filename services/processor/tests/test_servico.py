import asyncio
import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

import asyncpg
import pytest

from ecopulse_common import geohash
from ecopulse_common.consumer import PermanentError
from ecopulse_common.events import (
    Envelope,
    EventType,
    OcorrenciaPayload,
    RelatoRecebido,
    Severidade,
    StatusOcorrencia,
    TipoRisco,
)
from ecopulse_processor.servico import expirar_ocorrencias, processar_relato

LAT = -23.5505
LON = -46.6333

_CONTAGENS = {
    "relatos": "SELECT count(*) FROM relatos",
    "ocorrencias": "SELECT count(*) FROM ocorrencias",
    "outbox": "SELECT count(*) FROM outbox",
}


def _envelope(
    *,
    latitude: float = LAT,
    longitude: float = LON,
    tipo: TipoRisco = TipoRisco.ALAGAMENTO,
    severidade: Severidade = Severidade.ALTO,
    client_id: UUID | None = None,
) -> Envelope:
    payload = RelatoRecebido(
        client_id=client_id or uuid4(),
        device_id=uuid4(),
        tipo=tipo,
        severidade=severidade,
        descricao=None,
        latitude=latitude,
        longitude=longitude,
        registrado_em=datetime(2026, 11, 7, 12, 0, tzinfo=UTC),
    )
    return Envelope(
        type=EventType.RELATO_RECEBIDO,
        geohash=geohash.encode(latitude, longitude, geohash.CELL_PRECISION),
        payload=payload.model_dump(mode="json"),
    )


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


@pytest.mark.integration
async def test_mesmo_client_id_e_idempotente(pool: asyncpg.Pool) -> None:
    envelope = _envelope()

    await processar_relato(pool, envelope)
    await processar_relato(pool, envelope)

    assert await _contar(pool, "relatos") == 1
    assert await _contar(pool, "ocorrencias") == 1
    assert await _contar(pool, "outbox") == 1


@pytest.mark.integration
async def test_relatos_proximos_do_mesmo_tipo_agrupam(pool: asyncpg.Pool) -> None:
    await processar_relato(pool, _envelope(severidade=Severidade.MODERADO))
    await processar_relato(pool, _envelope(latitude=LAT + 0.0009, severidade=Severidade.CRITICO))

    async with pool.acquire() as conn:
        ocorrencia = await conn.fetchrow("SELECT id, confirmacoes, severidade FROM ocorrencias")
    assert ocorrencia is not None
    assert ocorrencia["confirmacoes"] == 2
    assert ocorrencia["severidade"] == Severidade.CRITICO.value

    eventos = await _eventos(pool)
    assert [routing_key for routing_key, _ in eventos] == [
        EventType.OCORRENCIA_CRIADA.value,
        EventType.OCORRENCIA_ATUALIZADA.value,
    ]

    ids: set[int] = set()
    for _, dados in eventos:
        envelope = Envelope.model_validate(dados)
        payload = OcorrenciaPayload.model_validate(envelope.payload)
        ids.add(payload.id)
    assert len(ids) == 1
    assert OcorrenciaPayload.model_validate(eventos[0][1]["payload"]).confirmacoes == 1
    assert OcorrenciaPayload.model_validate(eventos[1][1]["payload"]).confirmacoes == 2


@pytest.mark.integration
async def test_relatos_a_um_km_nao_agrupam(pool: asyncpg.Pool) -> None:
    await processar_relato(pool, _envelope())
    await processar_relato(pool, _envelope(latitude=LAT + 0.009))

    assert await _contar(pool, "ocorrencias") == 2
    assert await _contar(pool, "outbox") == 2


@pytest.mark.integration
async def test_tipos_diferentes_no_mesmo_lugar_nao_agrupam(pool: asyncpg.Pool) -> None:
    await processar_relato(pool, _envelope(tipo=TipoRisco.ALAGAMENTO))
    await processar_relato(pool, _envelope(tipo=TipoRisco.CALOR))

    assert await _contar(pool, "ocorrencias") == 2


@pytest.mark.integration
async def test_ocorrencia_vencida_nao_recebe_relato_e_expira(pool: asyncpg.Pool) -> None:
    await processar_relato(pool, _envelope())

    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE ocorrencias SET expira_em = now() - interval '1 minute' WHERE id = 1"
        )

    # A ocorrência vencida não é reutilizada: o relato abre uma nova ocorrência.
    await processar_relato(pool, _envelope())

    async with pool.acquire() as conn:
        antiga = await conn.fetchrow("SELECT confirmacoes FROM ocorrencias WHERE id = 1")
    assert antiga is not None
    assert antiga["confirmacoes"] == 1
    assert await _contar(pool, "ocorrencias") == 2

    assert await expirar_ocorrencias(pool) == 1
    assert await expirar_ocorrencias(pool) == 0

    async with pool.acquire() as conn:
        status = await conn.fetchval("SELECT status FROM ocorrencias WHERE id = 1")
    assert status == StatusOcorrencia.EXPIRADA.value

    expirados = [
        OcorrenciaPayload.model_validate(dados["payload"])
        for routing_key, dados in await _eventos(pool)
        if routing_key == EventType.OCORRENCIA_EXPIRADA.value
    ]
    assert len(expirados) == 1
    assert expirados[0].id == 1
    assert expirados[0].status is StatusOcorrencia.EXPIRADA


@pytest.mark.integration
async def test_concorrencia_no_mesmo_ponto_gera_uma_ocorrencia(pool: asyncpg.Pool) -> None:
    envelopes = [_envelope() for _ in range(20)]

    await asyncio.gather(*(processar_relato(pool, envelope) for envelope in envelopes))

    async with pool.acquire() as conn:
        ocorrencias = await conn.fetch("SELECT confirmacoes FROM ocorrencias")
    assert len(ocorrencias) == 1
    assert ocorrencias[0]["confirmacoes"] == 20
    assert await _contar(pool, "relatos") == 20


@pytest.mark.integration
async def test_payload_invalido_vira_erro_permanente(pool: asyncpg.Pool) -> None:
    envelope = Envelope(
        type=EventType.RELATO_RECEBIDO,
        geohash=geohash.encode(LAT, LON, geohash.CELL_PRECISION),
        payload={"client_id": "não-é-uuid"},
    )

    with pytest.raises(PermanentError):
        await processar_relato(pool, envelope)

    assert await _contar(pool, "relatos") == 0
