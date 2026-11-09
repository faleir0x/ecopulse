from uuid import UUID, uuid4

import asyncpg
import pytest

from ecopulse_api import aparelhos
from ecopulse_api.schemas import AparelhoIn
from ecopulse_common.events import Severidade, TipoRisco

pytestmark = pytest.mark.integration


def _aparelho(**alteracoes: object) -> AparelhoIn:
    dados: dict[str, object] = {
        "token": f"token-{uuid4()}",
        "latitude": -23.5505,
        "longitude": -46.6333,
        "raio_m": 1_000,
        "limiar": Severidade.ALTO,
        "tipos": [TipoRisco.ALAGAMENTO, TipoRisco.CALOR],
        "silenciado_ate": None,
    }
    dados.update(alteracoes)
    return AparelhoIn.model_validate(dados)


async def _ids(pool: asyncpg.Pool) -> set[UUID]:
    async with pool.acquire() as conn:
        linhas = await conn.fetch("SELECT id FROM aparelhos")
    return {linha["id"] for linha in linhas}


async def test_registrar_grava_posicao_arredondada_e_limiar(pool: asyncpg.Pool) -> None:
    aparelho_id = uuid4()
    dados = _aparelho(
        latitude=-23.55059,
        longitude=-46.63331,
        limiar=Severidade.ALTO,
        tipos=[TipoRisco.ALAGAMENTO, TipoRisco.CALOR, TipoRisco.ALAGAMENTO],
    )

    await aparelhos.registrar(pool, aparelho_id, dados)

    async with pool.acquire() as conn:
        linha = await conn.fetchrow(
            """
            SELECT ST_Y(geom::geometry) AS lat, ST_X(geom::geometry) AS lon,
                   limiar, tipos, raio_m
            FROM aparelhos
            WHERE id = $1
            """,
            aparelho_id,
        )
    assert linha is not None
    assert linha["lat"] == pytest.approx(round(-23.55059, aparelhos.CASAS_DECIMAIS))
    assert linha["lon"] == pytest.approx(round(-46.63331, aparelhos.CASAS_DECIMAIS))
    assert linha["limiar"] == 2
    assert linha["tipos"] == [TipoRisco.ALAGAMENTO.value, TipoRisco.CALOR.value]
    assert linha["raio_m"] == 1_000


async def test_registrar_de_novo_o_mesmo_id_atualiza(pool: asyncpg.Pool) -> None:
    aparelho_id = uuid4()
    token_novo = f"token-{uuid4()}"
    await aparelhos.registrar(pool, aparelho_id, _aparelho(limiar=Severidade.BAIXO))

    await aparelhos.registrar(
        pool,
        aparelho_id,
        _aparelho(
            token=token_novo,
            raio_m=2_000,
            limiar=Severidade.CRITICO,
            tipos=[TipoRisco.CALOR],
        ),
    )

    assert await _ids(pool) == {aparelho_id}
    async with pool.acquire() as conn:
        linha = await conn.fetchrow(
            "SELECT token, raio_m, limiar, tipos FROM aparelhos WHERE id = $1",
            aparelho_id,
        )
    assert linha is not None
    assert linha["token"] == token_novo
    assert linha["raio_m"] == 2_000
    assert linha["limiar"] == 3
    assert linha["tipos"] == [TipoRisco.CALOR.value]


async def test_mesmo_token_com_outro_id_apaga_o_registro_antigo(pool: asyncpg.Pool) -> None:
    token = f"token-{uuid4()}"
    antigo = uuid4()
    novo = uuid4()
    await aparelhos.registrar(pool, antigo, _aparelho(token=token))

    await aparelhos.registrar(pool, novo, _aparelho(token=token))

    assert await _ids(pool) == {novo}


async def test_remover_apaga_e_e_idempotente(pool: asyncpg.Pool) -> None:
    aparelho_id = uuid4()
    await aparelhos.registrar(pool, aparelho_id, _aparelho())

    await aparelhos.remover(pool, aparelho_id)
    await aparelhos.remover(pool, aparelho_id)

    assert await _ids(pool) == set()
