"""Consultas do notifier na tabela `aparelhos` (infra/postgres/init.sql)."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

import asyncpg

from ecopulse_common.events import OcorrenciaPayload, Severidade

# Registro sem renovação há mais que isso não recebe e é apagado em `apagar_antigos`
VALIDADE_REGISTRO_DIAS = 7
# Maior raio aceito no registro (schemas.AparelhoIn): filtro constante que usa o índice GiST
RAIO_MAXIMO_M = 10_000

_NIVEIS = [severidade.value for severidade in Severidade]


@dataclass(frozen=True)
class Destino:
    aparelho_id: UUID
    token: str
    distancia_m: float


async def destinos(
    pool: asyncpg.Pool, ocorrencia: OcorrenciaPayload, agora: datetime
) -> list[Destino]:
    """Aparelhos que devem ser avisados da ocorrência: dentro do próprio raio
    (ST_DWithin com RAIO_MAXIMO_M e depois com raio_m), tipo em `tipos`, nível da
    severidade >= `limiar`, não silenciados (silenciado_ate nulo ou <= agora) e renovados
    nos últimos VALIDADE_REGISTRO_DIAS. Distância por ST_Distance em metros."""
    nivel = _NIVEIS.index(ocorrencia.severidade.value)
    async with pool.acquire() as conn:
        linhas = await conn.fetch(
            """
            WITH ponto AS (
                SELECT ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography AS geom
            )
            SELECT a.id, a.token, ST_Distance(a.geom, ponto.geom) AS distancia_m
            FROM aparelhos AS a, ponto
            WHERE ST_DWithin(a.geom, ponto.geom, $3)
              AND ST_DWithin(a.geom, ponto.geom, a.raio_m)
              AND a.limiar <= $4
              AND $5 = ANY(a.tipos)
              AND (a.silenciado_ate IS NULL OR a.silenciado_ate <= $6)
              AND a.atualizado_em > $6 - make_interval(days => $7::int)
            ORDER BY distancia_m
            """,
            ocorrencia.latitude,
            ocorrencia.longitude,
            RAIO_MAXIMO_M,
            nivel,
            ocorrencia.tipo.value,
            agora,
            VALIDADE_REGISTRO_DIAS,
        )

    return [
        Destino(
            aparelho_id=linha["id"],
            token=linha["token"],
            distancia_m=float(linha["distancia_m"]),
        )
        for linha in linhas
    ]


async def remover_token(pool: asyncpg.Pool, token: str) -> None:
    """Apaga o registro do token que o FCM disse não existir mais."""
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM aparelhos WHERE token = $1", token)


async def apagar_antigos(pool: asyncpg.Pool, agora: datetime) -> int:
    """Apaga registros sem renovação há mais de VALIDADE_REGISTRO_DIAS; devolve quantos."""
    async with pool.acquire() as conn:
        total = await conn.fetchval(
            """
            WITH apagados AS (
                DELETE FROM aparelhos
                WHERE atualizado_em <= $1::timestamptz - make_interval(days => $2::int)
                RETURNING id
            )
            SELECT count(*) FROM apagados
            """,
            agora,
            VALIDADE_REGISTRO_DIAS,
        )
    return int(total)
