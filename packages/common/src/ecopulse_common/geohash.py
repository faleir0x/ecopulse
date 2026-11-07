"""GeoHash puro em Python (sem dependências).

Precisões usadas no projeto (ver ADR 0003):
- CELL_PRECISION (6): célula de ocorrência e de assinatura de alertas
- PARTITION_PRECISION (5): chave de partição nas filas e no cache
"""

import math

CELL_PRECISION = 6
PARTITION_PRECISION = 5

BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"

_LAT_RANGE = (-90.0, 90.0)
_LON_RANGE = (-180.0, 180.0)


def encode(latitude: float, longitude: float, precision: int = CELL_PRECISION) -> str:
    """Codifica uma coordenada. Levanta ValueError fora de [-90,90]x[-180,180] ou precision < 1."""
    if not math.isfinite(latitude) or not math.isfinite(longitude):
        raise ValueError("latitude e longitude devem ser finitas")
    if not _LAT_RANGE[0] <= latitude <= _LAT_RANGE[1]:
        raise ValueError(f"latitude fora de [-90, 90]: {latitude}")
    if not _LON_RANGE[0] <= longitude <= _LON_RANGE[1]:
        raise ValueError(f"longitude fora de [-180, 180]: {longitude}")
    if precision < 1:
        raise ValueError(f"precisão deve ser >= 1: {precision}")

    lat_min, lat_max = _LAT_RANGE
    lon_min, lon_max = _LON_RANGE
    resultado: list[str] = []
    bits = 0
    valor = 0
    longitude_agora = True

    while len(resultado) < precision:
        if longitude_agora:
            meio = (lon_min + lon_max) / 2
            if longitude >= meio:
                valor = (valor << 1) | 1
                lon_min = meio
            else:
                valor <<= 1
                lon_max = meio
        else:
            meio = (lat_min + lat_max) / 2
            if latitude >= meio:
                valor = (valor << 1) | 1
                lat_min = meio
            else:
                valor <<= 1
                lat_max = meio

        longitude_agora = not longitude_agora
        bits += 1
        if bits == 5:
            resultado.append(BASE32[valor])
            bits = 0
            valor = 0

    return "".join(resultado)


def decode_bbox(geohash: str) -> tuple[float, float, float, float]:
    """Retorna (lat_min, lon_min, lat_max, lon_max) da célula. ValueError se inválido."""
    if not is_valid(geohash):
        raise ValueError(f"geohash inválido: {geohash!r}")

    lat_min, lat_max = _LAT_RANGE
    lon_min, lon_max = _LON_RANGE
    longitude_agora = True

    for caractere in geohash:
        indice = BASE32.index(caractere)
        for mascara in (16, 8, 4, 2, 1):
            if longitude_agora:
                meio = (lon_min + lon_max) / 2
                if indice & mascara:
                    lon_min = meio
                else:
                    lon_max = meio
            else:
                meio = (lat_min + lat_max) / 2
                if indice & mascara:
                    lat_min = meio
                else:
                    lat_max = meio
            longitude_agora = not longitude_agora

    return lat_min, lon_min, lat_max, lon_max


def neighbors(geohash: str) -> list[str]:
    """As 8 células vizinhas, mesma precisão, ordem: N, NE, E, SE, S, SW, W, NW.

    Nos polos (sem vizinho ao norte/sul) a célula fora do intervalo é omitida.
    Na linha de 180° a longitude dá a volta.
    """
    if not is_valid(geohash):
        raise ValueError(f"geohash inválido: {geohash!r}")

    lat_min, lon_min, lat_max, lon_max = decode_bbox(geohash)
    lat_centro = (lat_min + lat_max) / 2
    lon_centro = (lon_min + lon_max) / 2
    altura = lat_max - lat_min
    largura = lon_max - lon_min
    precisao = len(geohash)

    deslocamentos = (
        (altura, 0.0),  # N
        (altura, largura),  # NE
        (0.0, largura),  # E
        (-altura, largura),  # SE
        (-altura, 0.0),  # S
        (-altura, -largura),  # SW
        (0.0, -largura),  # W
        (altura, -largura),  # NW
    )

    resultado: list[str] = []
    for delta_lat, delta_lon in deslocamentos:
        lat = lat_centro + delta_lat
        lon = lon_centro + delta_lon

        if not _LAT_RANGE[0] <= lat <= _LAT_RANGE[1]:
            continue
        if lon > _LON_RANGE[1]:
            lon -= 360.0
        elif lon < _LON_RANGE[0]:
            lon += 360.0

        resultado.append(encode(lat, lon, precisao))

    return resultado


def is_valid(geohash: str) -> bool:
    """True se não vazio e só tem caracteres de BASE32."""
    return isinstance(geohash, str) and bool(geohash) and all(c in BASE32 for c in geohash)
