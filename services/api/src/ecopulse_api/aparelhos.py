"""Registro dos aparelhos para push remoto (tabela `aparelhos`, lida pelo serviço notifier)."""

from uuid import UUID

import asyncpg

from ecopulse_api.schemas import AparelhoIn

# ~110 m: o servidor não guarda a posição exata de ninguém
CASAS_DECIMAIS = 3


async def registrar(pool: asyncpg.Pool, aparelho_id: UUID, dados: AparelhoIn) -> None:
    """Cria ou atualiza o registro (atualizado_em = now()). Posição arredondada a
    CASAS_DECIMAIS; limiar gravado como nível 0..3 (ordem de Severidade); tipos sem
    repetição. Um token que já pertencia a OUTRO id (reinstalação) tem o registro antigo
    apagado antes, na mesma transação."""
    # TODO(worker)
    raise NotImplementedError


async def remover(pool: asyncpg.Pool, aparelho_id: UUID) -> None:
    """Apaga o registro (o app desligou as notificações). Sem registro, não faz nada."""
    # TODO(worker)
    raise NotImplementedError
