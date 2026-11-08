from datetime import timedelta
from uuid import UUID, uuid4

import asyncpg
import pytest
from fastapi.testclient import TestClient

from ecopulse_common.events import StatusOcorrencia

pytestmark = pytest.mark.integration

LATITUDE = -23.5505
LONGITUDE = -46.6333


async def _ocorrencia(
    pool: asyncpg.Pool,
    *,
    status: StatusOcorrencia = StatusOcorrencia.ATIVA,
    confirmacoes: int = 1,
) -> int:
    validade = timedelta(hours=1) if status is StatusOcorrencia.ATIVA else timedelta(hours=-1)
    async with pool.acquire() as conn:
        ocorrencia_id = await conn.fetchval(
            """
            INSERT INTO ocorrencias (
                tipo, severidade, geom, geohash, confirmacoes, status, expira_em
            )
            VALUES (
                'alagamento', 'alto',
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                '6gyf4b', $3, $4, now() + $5::interval
            )
            RETURNING id
            """,
            LONGITUDE,
            LATITUDE,
            confirmacoes,
            status.value,
            validade,
        )
    assert ocorrencia_id is not None
    return int(ocorrencia_id)


async def _relato(pool: asyncpg.Pool, ocorrencia_id: int | None, client_id: UUID) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO relatos (
                client_id, device_id, tipo, severidade, geom, geohash, registrado_em, ocorrencia_id
            )
            VALUES (
                $1, $2, 'alagamento', 'alto',
                ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
                '6gyf4b', now(), $5
            )
            """,
            client_id,
            uuid4(),
            LONGITUDE,
            LATITUDE,
            ocorrencia_id,
        )


async def test_relato_processado_devolve_ocorrencia_e_confirmacoes(
    cliente: TestClient, pool: asyncpg.Pool
) -> None:
    ocorrencia_id = await _ocorrencia(pool, confirmacoes=4)
    client_id = uuid4()
    await _relato(pool, ocorrencia_id, client_id)

    resposta = cliente.get(f"/v1/relatos/{client_id}")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo == {
        "client_id": str(client_id),
        "ocorrencia_id": ocorrencia_id,
        "status_ocorrencia": "ativa",
        "confirmacoes": 4,
    }
    assert "device_id" not in corpo


async def test_relato_ainda_nao_processado_responde_404(
    cliente: TestClient,
) -> None:
    resposta = cliente.get(f"/v1/relatos/{uuid4()}")

    assert resposta.status_code == 404
    assert resposta.json() == {"detail": "processando"}


async def test_relato_com_ocorrencia_expirada(cliente: TestClient, pool: asyncpg.Pool) -> None:
    ocorrencia_id = await _ocorrencia(pool, status=StatusOcorrencia.EXPIRADA, confirmacoes=7)
    client_id = uuid4()
    await _relato(pool, ocorrencia_id, client_id)

    resposta = cliente.get(f"/v1/relatos/{client_id}")

    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["ocorrencia_id"] == ocorrencia_id
    assert corpo["status_ocorrencia"] == "expirada"
    assert corpo["confirmacoes"] == 7
