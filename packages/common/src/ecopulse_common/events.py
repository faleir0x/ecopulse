"""Contratos dos eventos trocados entre os serviços."""

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class EventType(StrEnum):
    RELATO_RECEBIDO = "relato.recebido"
    OCORRENCIA_CRIADA = "ocorrencia.criada"
    OCORRENCIA_ATUALIZADA = "ocorrencia.atualizada"
    OCORRENCIA_EXPIRADA = "ocorrencia.expirada"
    LEITURA_AMBIENTE = "leitura.ambiente"


class TipoRisco(StrEnum):
    ALAGAMENTO = "alagamento"
    CALOR = "calor"
    QUALIDADE_AR = "qualidade_ar"
    ROTA_OBSTRUIDA = "rota_obstruida"


class Severidade(StrEnum):
    BAIXO = "baixo"
    MODERADO = "moderado"
    ALTO = "alto"
    CRITICO = "critico"


class Envelope(BaseModel):
    """Envelope comum a todos os eventos. `event_id` vira o message_id no broker."""

    event_id: UUID = Field(default_factory=uuid4)
    type: EventType
    version: int = 1
    occurred_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    geohash: str = Field(min_length=6, max_length=12)  # precisão >= 6
    payload: dict[str, Any]


class RelatoRecebido(BaseModel):
    """Payload de `relato.recebido`."""

    client_id: UUID  # gerado no app; chave de idempotência
    device_id: UUID
    tipo: TipoRisco
    severidade: Severidade
    descricao: str | None = Field(default=None, max_length=500)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    registrado_em: datetime  # horário no aparelho (pode ser antigo, se veio da outbox offline)
