from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import asyncpg
import pytest

from ecopulse_common import geohash
from ecopulse_common.events import (
    OcorrenciaPayload,
    Severidade,
    StatusOcorrencia,
    TipoRisco,
)
from ecopulse_notifier import repositorio

pytestmark = pytest.mark.integration

LATITUDE = 0.0
LONGITUDE = 0.0
METROS_POR_GRAU = 110_574.0


def _graus(metros: float) -> float:
    return metros / METROS_POR_GRAU


def _ocorrencia(
    *,
    tipo: TipoRisco = TipoRisco.ALAGAMENTO,
    severidade: Severidade = Severidade.ALTO,
) -> OcorrenciaPayload:
    agora = datetime.now(UTC)
    return OcorrenciaPayload(
        id=1,
        tipo=tipo,
        severidade=severidade,
        latitude=LATITUDE,
        longitude=LONGITUDE,
        geohash=geohash.encode(LATITUDE, LONGITUDE, geohash.CELL_PRECISION),
        confirmacoes=3,
        status=StatusOcorrencia.ATIVA,
        criada_em=agora,
        atualizada_em=agora,
        expira_em=agora + timedelta(hours=1),
    )


async def _inserir(
    pool: asyncpg.Pool,
    *,
    aparelho_id: UUID | None = None,
    token: str | None = None,
    latitude: float = LATITUDE,
    longitude: float = LONGITUDE,
    raio_m: int = 1_000,
    limiar: int = 0,
    tipos: list[str] | None = None,
    silenciado_ate: datetime | None = None,
    atualizado_em: datetime | None = None,
) -> UUID:
    identificador = aparelho_id or uuid4()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO aparelhos (
                id, token, geom, raio_m, limiar, tipos, silenciado_ate, atualizado_em
            )
            VALUES (
                $1, $2,
                ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
                $5, $6, $7, $8, $9
            )
            """,
            identificador,
            token or f"token-{identificador}",
            latitude,
            longitude,
            raio_m,
            limiar,
            tipos or [TipoRisco.ALAGAMENTO.value],
            silenciado_ate,
            atualizado_em or datetime.now(UTC),
        )
    return identificador


async def _ids(pool: asyncpg.Pool) -> set[UUID]:
    async with pool.acquire() as conn:
        linhas = await conn.fetch("SELECT id FROM aparelhos")
    return {linha["id"] for linha in linhas}


async def test_aparelho_dentro_do_raio_recebe(pool: asyncpg.Pool) -> None:
    alvo = await _inserir(pool, latitude=_graus(300))

    resultado = await repositorio.destinos(pool, _ocorrencia(), datetime.now(UTC))

    assert [destino.aparelho_id for destino in resultado] == [alvo]
    assert resultado[0].distancia_m == pytest.approx(300, abs=2)


async def test_aparelho_fora_do_raio_nao_recebe(pool: asyncpg.Pool) -> None:
    await _inserir(pool, latitude=_graus(1_500))

    assert await repositorio.destinos(pool, _ocorrencia(), datetime.now(UTC)) == []


async def test_tipo_fora_da_lista_nao_recebe(pool: asyncpg.Pool) -> None:
    await _inserir(pool, tipos=[TipoRisco.CALOR.value])

    assert await repositorio.destinos(pool, _ocorrencia(), datetime.now(UTC)) == []


async def test_limiar_acima_da_severidade_nao_recebe(pool: asyncpg.Pool) -> None:
    # Ocorrência ALTO (nível 2); limiar CRÍTICO (nível 3) não recebe
    await _inserir(pool, limiar=3)

    assert await repositorio.destinos(pool, _ocorrencia(), datetime.now(UTC)) == []


async def test_silenciado_ate_o_futuro_nao_recebe(pool: asyncpg.Pool) -> None:
    await _inserir(pool, silenciado_ate=datetime.now(UTC) + timedelta(hours=1))

    assert await repositorio.destinos(pool, _ocorrencia(), datetime.now(UTC)) == []


async def test_registro_de_oito_dias_atras_nao_recebe(pool: asyncpg.Pool) -> None:
    agora = datetime.now(UTC)
    await _inserir(pool, atualizado_em=agora - timedelta(days=8))

    assert await repositorio.destinos(pool, _ocorrencia(), agora) == []


async def test_apagar_antigos_apaga_so_o_antigo(pool: asyncpg.Pool) -> None:
    agora = datetime.now(UTC)
    await _inserir(pool, atualizado_em=agora - timedelta(days=8))
    novo = await _inserir(pool, atualizado_em=agora - timedelta(days=1))

    assert await repositorio.apagar_antigos(pool, agora) == 1
    assert await _ids(pool) == {novo}


async def test_remover_token_apaga(pool: asyncpg.Pool) -> None:
    await _inserir(pool, token="token-para-remover")  # noqa: S106

    await repositorio.remover_token(pool, "token-para-remover")

    assert await _ids(pool) == set()
