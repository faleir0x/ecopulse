"""Consultas do notifier na tabela `aparelhos` (infra/postgres/init.sql)."""

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

import asyncpg

from ecopulse_common.events import OcorrenciaPayload

# Registro sem renovação há mais que isso não recebe e é apagado em `apagar_antigos`
VALIDADE_REGISTRO_DIAS = 7
# Maior raio aceito no registro (schemas.AparelhoIn): filtro constante que usa o índice GiST
RAIO_MAXIMO_M = 10_000


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
    # TODO(worker)
    raise NotImplementedError


async def remover_token(pool: asyncpg.Pool, token: str) -> None:
    """Apaga o registro do token que o FCM disse não existir mais."""
    # TODO(worker)
    raise NotImplementedError


async def apagar_antigos(pool: asyncpg.Pool, agora: datetime) -> int:
    """Apaga registros sem renovação há mais de VALIDADE_REGISTRO_DIAS; devolve quantos."""
    # TODO(worker)
    raise NotImplementedError
