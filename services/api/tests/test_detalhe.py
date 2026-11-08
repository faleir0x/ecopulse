from uuid import uuid4

import asyncpg
import pytest

from ecopulse_api import leitura


async def _ocorrencia_com_relatos(pool: asyncpg.Pool, notas: list[str | None]) -> int:
    async with pool.acquire() as conn:
        ocorrencia_id: int = await conn.fetchval(
            """
            INSERT INTO ocorrencias (tipo, severidade, geom, geohash, expira_em)
            VALUES ('alagamento', 'alto', ST_SetSRID(ST_MakePoint(-9.14, 38.72), 4326)::geography,
                    'eyckpt', now() + interval '1 hour')
            RETURNING id
            """
        )
        for indice, nota in enumerate(notas):
            await conn.execute(
                """
                INSERT INTO relatos (client_id, device_id, tipo, severidade, descricao, geom,
                                     geohash, registrado_em, recebido_em, ocorrencia_id)
                VALUES ($1, $2, 'alagamento', 'alto', $3,
                        ST_SetSRID(ST_MakePoint(-9.14, 38.72), 4326)::geography, 'eyckpt',
                        now(), now() - make_interval(mins => $4), $5)
                """,
                uuid4(),
                uuid4(),
                nota,
                len(notas) - indice,  # o primeiro da lista é o mais antigo
                ocorrencia_id,
            )
    return ocorrencia_id


@pytest.mark.integration
async def test_detalhe_traz_linha_do_tempo_e_nota_mais_recente(pool: asyncpg.Pool) -> None:
    ocorrencia_id = await _ocorrencia_com_relatos(
        pool, ["Rua tomada pela água", None, "Baixou um pouco"]
    )

    detalhe = await leitura.detalhar_ocorrencia(pool, ocorrencia_id)

    assert detalhe is not None
    assert len(detalhe.linha_do_tempo) == 3
    assert detalhe.linha_do_tempo == sorted(detalhe.linha_do_tempo)
    assert detalhe.nota == "Baixou um pouco"


@pytest.mark.integration
async def test_detalhe_sem_nota(pool: asyncpg.Pool) -> None:
    ocorrencia_id = await _ocorrencia_com_relatos(pool, [None, ""])

    detalhe = await leitura.detalhar_ocorrencia(pool, ocorrencia_id)

    assert detalhe is not None
    assert detalhe.nota is None
    assert len(detalhe.linha_do_tempo) == 2


@pytest.mark.integration
async def test_detalhe_inexistente(pool: asyncpg.Pool) -> None:
    assert await leitura.detalhar_ocorrencia(pool, 999_999) is None
