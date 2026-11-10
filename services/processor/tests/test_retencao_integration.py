from datetime import UTC, datetime, timedelta
from uuid import uuid4

import asyncpg
import pytest

from ecopulse_processor import retencao

pytestmark = pytest.mark.integration

GEOHASH_ANTIGO = "6gyf4b"
GEOHASH_RECENTE = "6gyf4c"


async def _inserir_relato(pool: asyncpg.Pool, registrado_em: datetime) -> int:
    async with pool.acquire() as conn:
        return int(
            await conn.fetchval(
                """
                INSERT INTO relatos (
                    client_id, device_id, tipo, severidade, descricao, geom, geohash,
                    registrado_em
                )
                VALUES (
                    $1, $2, 'alagamento', 'alto', 'perto da praça',
                    ST_SetSRID(ST_MakePoint(-46.6333, -23.5505), 4326)::geography,
                    $3, $4
                )
                RETURNING id
                """,
                uuid4(),
                uuid4(),
                "6gyf4b",
                registrado_em,
            )
        )


async def _inserir_leitura(pool: asyncpg.Pool, geohash: str, medido_em: datetime) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO leituras_ambiente (geohash, medido_em, leitura)
            VALUES ($1, $2, '{}'::jsonb)
            """,
            geohash,
            medido_em,
        )


async def _limpar_leituras(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM leituras_ambiente WHERE geohash IN ($1, $2)",
            GEOHASH_ANTIGO,
            GEOHASH_RECENTE,
        )


async def test_aplicar_anonimiza_relatos_antigos_e_apaga_leituras_antigas(
    pool: asyncpg.Pool,
) -> None:
    agora = datetime.now(UTC)
    id_antigo = await _inserir_relato(pool, agora - timedelta(days=31))
    id_recente = await _inserir_relato(pool, agora - timedelta(days=1))
    await _limpar_leituras(pool)
    await _inserir_leitura(pool, GEOHASH_ANTIGO, agora - timedelta(days=8))
    await _inserir_leitura(pool, GEOHASH_RECENTE, agora - timedelta(days=1))

    try:
        anonimizados, leituras = await retencao.aplicar(pool)

        assert anonimizados == 1
        assert leituras == 1

        async with pool.acquire() as conn:
            antigo = await conn.fetchrow(
                "SELECT device_id, descricao FROM relatos WHERE id = $1", id_antigo
            )
            assert antigo is not None
            assert antigo["device_id"] == retencao.DEVICE_ANONIMO
            assert antigo["descricao"] is None

            recente = await conn.fetchrow(
                "SELECT device_id, descricao FROM relatos WHERE id = $1", id_recente
            )
            assert recente is not None
            assert recente["device_id"] != retencao.DEVICE_ANONIMO
            assert recente["descricao"] == "perto da praça"

            assert (
                await conn.fetchval(
                    "SELECT count(*) FROM leituras_ambiente WHERE geohash = $1",
                    GEOHASH_ANTIGO,
                )
                == 0
            )
            assert (
                await conn.fetchval(
                    "SELECT count(*) FROM leituras_ambiente WHERE geohash = $1",
                    GEOHASH_RECENTE,
                )
                == 1
            )
    finally:
        await _limpar_leituras(pool)
