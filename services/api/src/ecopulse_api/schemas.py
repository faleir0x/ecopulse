from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

from ecopulse_common.events import OcorrenciaPayload, Severidade, TipoRisco


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


class SituacaoRelato(BaseModel):
    """Em qual ocorrência o relato do próprio aparelho entrou. Nunca expõe o device_id."""

    client_id: UUID
    ocorrencia_id: int | None
    status_ocorrencia: Literal["ativa", "expirada"] | None
    confirmacoes: int | None


class OcorrenciaDetalhe(OcorrenciaPayload):
    """Ocorrência + o que só o detalhe mostra: quando foi confirmada e a nota mais recente."""

    linha_do_tempo: list[datetime]  # recebimento de cada relato, do mais antigo ao mais novo
    nota: str | None


ModoRota = Literal["pedestre", "carro"]


class OcorrenciaEvitada(BaseModel):
    """Ocorrência que a rota segura contorna e a rota direta atravessaria."""

    id: int
    tipo: TipoRisco
    severidade: Severidade


class RotaDireta(BaseModel):
    """Rota sem desvios, para comparação. `atravessa` = ids das zonas cruzadas."""

    distancia_m: float
    duracao_s: float
    atravessa: list[int]


class RotaSegura(BaseModel):
    """Rota calculada desviando das ocorrências ativas (ou a direta, como fallback)."""

    modo: ModoRota
    distancia_m: float
    duracao_s: float
    coordenadas: list[tuple[float, float]]  # (lat, lon)
    evitadas: list[OcorrenciaEvitada]
    direta: RotaDireta | None
    aviso: str | None


class CelulaAmbiente(BaseModel):
    """Uma célula geohash5 do mapa com a última leitura ambiental (ou null por grandeza)."""

    geohash: str
    lat_min: float
    lon_min: float
    lat_max: float
    lon_max: float
    temperatura: float | None
    aqi: int | None
    medido_em: datetime
