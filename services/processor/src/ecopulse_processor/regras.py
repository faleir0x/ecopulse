"""Regras de negócio do agrupamento (valores fixos, decididos na arquitetura)."""

import math
from datetime import UTC, datetime, timedelta

from ecopulse_common import geohash
from ecopulse_common.events import Severidade, TipoRisco

# Relatos do mesmo tipo a até esta distância entram na mesma ocorrência ativa
RAIO_AGRUPAMENTO_M = 300

# Quanto tempo uma ocorrência fica ativa sem novas confirmações
VALIDADE: dict[TipoRisco, timedelta] = {
    TipoRisco.ALAGAMENTO: timedelta(hours=3),
    TipoRisco.CALOR: timedelta(hours=6),
    TipoRisco.QUALIDADE_AR: timedelta(hours=6),
    TipoRisco.ROTA_OBSTRUIDA: timedelta(hours=2),
}

# Ordem crescente; a ocorrência assume a maior severidade relatada
ORDEM_SEVERIDADE: tuple[Severidade, ...] = (
    Severidade.BAIXO,
    Severidade.MODERADO,
    Severidade.ALTO,
    Severidade.CRITICO,
)

# "Já passou": no máximo esta quantidade de marcações encerra a ocorrência
RESOLUCOES_MAXIMAS = 3


def resolucoes_para_encerrar(confirmacoes: int) -> int:
    """Marcações necessárias para encerrar: min(RESOLUCOES_MAXIMAS, confirmações), ao menos 1."""
    return max(1, min(RESOLUCOES_MAXIMAS, confirmacoes))


INTERVALO_EXPIRACAO_S = 60

_RAIO_TERRA_M = 6_371_000.0


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distância em metros entre dois pontos pela fórmula de haversine."""
    fi1 = math.radians(lat1)
    fi2 = math.radians(lat2)
    delta_fi = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    a = math.sin(delta_fi / 2) ** 2 + math.cos(fi1) * math.cos(fi2) * math.sin(delta_lon / 2) ** 2
    return 2 * _RAIO_TERRA_M * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def celulas_de_trava(latitude: float, longitude: float, raio_m: float) -> list[str]:
    """Células geohash5 (ordenadas, sem repetição) que o círculo de raio_m em volta do ponto
    toca: a célula do ponto + cada vizinha (geohash.neighbors) cujo retângulo
    (geohash.decode_bbox) fica a <= raio_m do ponto (distância do ponto ao ponto mais próximo
    do retângulo, em metros, por haversine — use ecopulse_common se houver função de distância,
    senão implemente aqui com raio da Terra 6_371_000 m).
    O processor trava TODAS (pg_advisory_xact_lock em ordem) antes de agrupar: dois relatos
    perto da borda entre células caem na mesma trava e não criam ocorrências duplicadas."""
    celula = geohash.encode(latitude, longitude, geohash.PARTITION_PRECISION)
    celulas = {celula}
    for vizinha in geohash.neighbors(celula):
        lat_min, lon_min, lat_max, lon_max = geohash.decode_bbox(vizinha)
        lat_proxima = min(max(latitude, lat_min), lat_max)
        lon_proxima = min(max(longitude, lon_min), lon_max)
        if _haversine_m(latitude, longitude, lat_proxima, lon_proxima) <= raio_m:
            celulas.add(vizinha)
    return sorted(celulas)


def relato_antigo(registrado_em: datetime, agora: datetime, validade: timedelta) -> bool:
    """True se o relato foi registrado antes de agora - validade (veio atrasado da fila
    offline do app e o risco já teria expirado). registrado_em sem fuso conta como UTC."""
    if registrado_em.tzinfo is None:
        registrado_em = registrado_em.replace(tzinfo=UTC)
    return registrado_em < agora - validade
