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


class ResolucaoIn(BaseModel):
    """Marcação de "já passou" de uma ocorrência existente."""

    client_id: UUID
    device_id: UUID
    registrado_em: datetime


class AparelhoIn(BaseModel):
    """Registro/renovação do aparelho para push remoto (PUT /v1/aparelhos/{id}). O app manda
    de novo ao mudar de lugar (> 500 m), de ajustes ou de token, e pelo menos 1 vez por dia."""

    token: str = Field(min_length=20, max_length=4096)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    raio_m: int = Field(ge=100, le=10_000)
    limiar: Severidade
    tipos: list[TipoRisco] = Field(max_length=len(TipoRisco))
    silenciado_ate: datetime | None = None


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
    """Ocorrência ligada à rota: contornada (`evitadas`) ou ainda no caminho (`no_caminho`)."""

    id: int
    tipo: TipoRisco
    severidade: Severidade
    latitude: float
    longitude: float


class RotaDireta(BaseModel):
    """Rota sem desvios, para comparação. `atravessa` = ids das zonas cruzadas."""

    distancia_m: float
    duracao_s: float
    coordenadas: list[tuple[float, float]]  # (lat, lon)
    atravessa: list[int]


class RotaSegura(BaseModel):
    """Rota calculada desviando das ocorrências ativas (ou a direta, como fallback)."""

    modo: ModoRota
    distancia_m: float
    duracao_s: float
    coordenadas: list[tuple[float, float]]  # (lat, lon)
    evitadas: list[OcorrenciaEvitada]
    # Zonas que a rota devolvida ainda cruza (origem/destino dentro, ou sem desvio possível)
    no_caminho: list[OcorrenciaEvitada]
    # True quando nenhum caminho evita os riscos: a rota devolvida é a direta
    sem_desvio: bool
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


class LocalEncontrado(BaseModel):
    """Resultado da busca de bairro/endereço (GET /v1/locais)."""

    nome: str
    detalhe: str | None
    latitude: float
    longitude: float
