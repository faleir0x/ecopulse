from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from ecopulse_common.events import Severidade, TipoRisco


class RelatoIn(BaseModel):
    client_id: UUID  # gerado no app, garante idempotência
    device_id: UUID
    tipo: TipoRisco
    severidade: Severidade
    descricao: str | None = Field(default=None, max_length=500)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    registrado_em: datetime


class RelatoAceito(BaseModel):
    status: Literal["aceito"] = "aceito"
    client_id: UUID


class ConfirmacaoIn(BaseModel):
    """Confirmação de uma ocorrência existente. Vira um relato no local da ocorrência."""

    client_id: UUID
    device_id: UUID
    registrado_em: datetime
