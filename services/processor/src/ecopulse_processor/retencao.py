"""Política de retenção de dados do processor (LGPD e crescimento do banco).

- Relatos: passados ANONIMIZAR_APOS dias, a posição exata deixa de ser vinculável a um
  aparelho (device_id vira DEVICE_ANONIMO) e o texto livre é apagado. A linha continua no
  banco para as estatísticas e o vínculo com a ocorrência.
- Leituras de ambiente: são um histórico de curto prazo; passados MANTER_LEITURAS dias são
  apagadas. Isso também impede que a tabela cresça sem limite com as células a cada coleta.

As duas limpezas rodam em lotes de LOTE linhas por comando para não segurar locks de tabela
inteira (e não inflar o WAL de uma vez). `aplicar` é chamada periodicamente pelo worker.
"""

import logging
from datetime import timedelta
from uuid import UUID

import asyncpg

log = logging.getLogger(__name__)

# Depois deste tempo o relato perde a identificação do aparelho e o texto livre
ANONIMIZAR_APOS = timedelta(days=30)

# device_id de um relato anonimizado (não pertence a nenhum aparelho)
DEVICE_ANONIMO = UUID(int=0)

# Quanto tempo as leituras de ambiente ficam guardadas
MANTER_LEITURAS = timedelta(days=7)

# Intervalo entre execuções da tarefa periódica no worker
INTERVALO_RETENCAO_S = 3600

# Máximo de linhas por comando (ver docstring do módulo)
LOTE = 5000


async def _anonimizar_relatos(conn: asyncpg.Connection) -> int:
    """UPDATE em lotes: device_id = DEVICE_ANONIMO e descricao = NULL nos relatos mais velhos
    que ANONIMIZAR_APOS. Repete até não sobrar nenhum. Retorna o total anonimizado."""
    total = 0
    while True:
        atualizados = await conn.fetchval(
            """
            WITH alvo AS (
                SELECT id
                FROM relatos
                WHERE registrado_em < now() - $1::interval
                  AND device_id <> $2
                ORDER BY id
                LIMIT $3
            ), atualizados AS (
                UPDATE relatos
                SET device_id = $2, descricao = NULL
                WHERE id IN (SELECT id FROM alvo)
                RETURNING id
            )
            SELECT count(*) FROM atualizados
            """,
            ANONIMIZAR_APOS,
            DEVICE_ANONIMO,
            LOTE,
        )
        if not atualizados:
            return total
        total += int(atualizados)


async def _apagar_leituras(conn: asyncpg.Connection) -> int:
    """DELETE em lotes das leituras mais velhas que MANTER_LEITURAS (a tabela não tem id;
    usa ctid). Repete até não sobrar nenhuma. Retorna o total apagado."""
    total = 0
    while True:
        apagadas = await conn.fetchval(
            """
            WITH alvo AS (
                SELECT ctid
                FROM leituras_ambiente
                WHERE medido_em < now() - $1::interval
                LIMIT $2
            ), apagadas AS (
                DELETE FROM leituras_ambiente
                WHERE ctid IN (SELECT ctid FROM alvo)
                RETURNING ctid
            )
            SELECT count(*) FROM apagadas
            """,
            MANTER_LEITURAS,
            LOTE,
        )
        if not apagadas:
            return total
        total += int(apagadas)


async def aplicar(pool: asyncpg.Pool) -> tuple[int, int]:
    """Anonimiza os relatos antigos e apaga as leituras antigas, numa transação.
    Retorna (relatos anonimizados, leituras apagadas)."""
    async with pool.acquire() as conn, conn.transaction():
        anonimizados = await _anonimizar_relatos(conn)
        leituras = await _apagar_leituras(conn)
    return anonimizados, leituras
