"""Registro dos aparelhos para push remoto (tabela `aparelhos`, lida pelo serviço notifier)."""

from uuid import UUID

import asyncpg

from ecopulse_api.schemas import AparelhoIn
from ecopulse_common.events import Severidade

# ~110 m: o servidor não guarda a posição exata de ninguém
CASAS_DECIMAIS = 3

_NIVEIS = [severidade.value for severidade in Severidade]


async def registrar(pool: asyncpg.Pool, aparelho_id: UUID, dados: AparelhoIn) -> None:
    """Cria ou atualiza o registro (atualizado_em = now()). Posição arredondada a
    CASAS_DECIMAIS; limiar gravado como nível 0..3 (ordem de Severidade); tipos sem
    repetição. Um token que já pertencia a OUTRO id (reinstalação) tem o registro antigo
    apagado antes, na mesma transação."""
    tipos = list(dict.fromkeys(tipo.value for tipo in dados.tipos))
    nivel = _NIVEIS.index(dados.limiar.value)
    latitude = round(dados.latitude, CASAS_DECIMAIS)
    longitude = round(dados.longitude, CASAS_DECIMAIS)

    async with pool.acquire() as conn, conn.transaction():
        await conn.execute(
            "DELETE FROM aparelhos WHERE token = $1 AND id <> $2",
            dados.token,
            aparelho_id,
        )
        await conn.execute(
            """
            INSERT INTO aparelhos (
                id, token, geom, raio_m, limiar, tipos, silenciado_ate, atualizado_em
            )
            VALUES (
                $1, $2,
                ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
                $5, $6, $7, $8, now()
            )
            ON CONFLICT (id) DO UPDATE SET
                token = EXCLUDED.token,
                geom = EXCLUDED.geom,
                raio_m = EXCLUDED.raio_m,
                limiar = EXCLUDED.limiar,
                tipos = EXCLUDED.tipos,
                silenciado_ate = EXCLUDED.silenciado_ate,
                atualizado_em = now()
            """,
            aparelho_id,
            dados.token,
            latitude,
            longitude,
            dados.raio_m,
            nivel,
            tipos,
            dados.silenciado_ate,
        )


async def remover(pool: asyncpg.Pool, aparelho_id: UUID) -> None:
    """Apaga o registro (o app desligou as notificações). Sem registro, não faz nada."""
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM aparelhos WHERE id = $1", aparelho_id)
