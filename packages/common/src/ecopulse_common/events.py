"""Contratos dos eventos trocados entre os serviços."""

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from pydantic import BaseModel, Field


class EventType(StrEnum):
    RELATO_RECEBIDO = "relato.recebido"
    RESOLUCAO_RECEBIDA = "resolucao.recebida"
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


class ResolucaoRecebida(BaseModel):
    """Payload de `resolucao.recebida`."""

    client_id: UUID
    device_id: UUID
    ocorrencia_id: int
    registrado_em: datetime


class StatusOcorrencia(StrEnum):
    ATIVA = "ativa"
    EXPIRADA = "expirada"


class OcorrenciaPayload(BaseModel):
    """Payload de `ocorrencia.criada` / `.atualizada` / `.expirada` (estado completo)."""

    id: int
    tipo: TipoRisco
    severidade: Severidade
    latitude: float
    longitude: float
    geohash: str
    confirmacoes: int
    status: StatusOcorrencia
    criada_em: datetime
    atualizada_em: datetime
    expira_em: datetime
    resolucoes: int = 0
    encerrada_em: datetime | None = None


class HoraPrevista(BaseModel):
    hora: datetime
    temperatura: float
    codigo_tempo: int  # WMO weather code
    chuva_mm: float


class LeituraAmbiente(BaseModel):
    """Payload de `leitura.ambiente`: condições atuais e previsão curta de uma célula geohash5."""

    geohash: str = Field(min_length=5, max_length=5)
    latitude: float
    longitude: float
    medido_em: datetime
    fonte: str  # "open-meteo" | "simulador"
    temperatura: float | None
    sensacao: float | None
    codigo_tempo: int | None
    minima_dia: float | None
    maxima_dia: float | None
    aqi: int | None  # US AQI
    chuva_mm_h: float | None  # intensidade atual
    proximas_horas: list[HoraPrevista]  # próximas 12 h
    chuva_3h: list[float]  # mm/h em 12 intervalos de 15 min
    # Vento a 10 m (km/h); direção em graus DE ONDE sopra (0 = norte). Opcionais: leituras antigas
    vento_kmh: float | None = None
    vento_direcao: int | None = None
    rajada_kmh: float | None = None
