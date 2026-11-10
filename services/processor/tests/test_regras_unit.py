import math
from datetime import UTC, datetime, timedelta

from ecopulse_common import geohash
from ecopulse_processor import regras

LAT = -23.5505
LON = -46.6333


def _graus_para_metros_leste(latitude: float, metros: float) -> float:
    """Converte uma distância em metros para graus de longitude na latitude dada."""
    return metros / (111_320.0 * math.cos(math.radians(latitude)))


def _celula_e_centro() -> tuple[str, float, float, float, float]:
    celula = geohash.encode(LAT, LON, geohash.PARTITION_PRECISION)
    lat_min, lon_min, lat_max, lon_max = geohash.decode_bbox(celula)
    return celula, (lat_min + lat_max) / 2, (lon_min + lon_max) / 2, lat_max, lon_max


def test_centro_da_celula_trava_so_a_propria_celula() -> None:
    celula, centro_lat, centro_lon, _, _ = _celula_e_centro()

    assert regras.celulas_de_trava(centro_lat, centro_lon, regras.RAIO_AGRUPAMENTO_M) == [celula]


def test_ponto_perto_da_borda_leste_trava_tambem_a_vizinha_leste() -> None:
    celula, centro_lat, _, _, lon_max = _celula_e_centro()
    ponto_lon = lon_max - _graus_para_metros_leste(centro_lat, 50)
    leste = geohash.neighbors(celula)[2]

    assert regras.celulas_de_trava(centro_lat, ponto_lon, regras.RAIO_AGRUPAMENTO_M) == sorted(
        [celula, leste]
    )


def test_celulas_de_trava_ordenadas_e_sem_repeticao() -> None:
    celula, centro_lat, _, _, lon_max = _celula_e_centro()
    ponto_lon = lon_max - _graus_para_metros_leste(centro_lat, 50)

    celulas = regras.celulas_de_trava(centro_lat, ponto_lon, regras.RAIO_AGRUPAMENTO_M)

    assert celulas == sorted(celulas)
    assert len(celulas) == len(set(celulas))
    assert celula in celulas


def test_relato_antigo_pela_validade() -> None:
    agora = datetime(2026, 11, 10, 12, 0, tzinfo=UTC)
    validade = timedelta(hours=3)

    assert regras.relato_antigo(agora - timedelta(hours=4), agora, validade)
    assert not regras.relato_antigo(agora - timedelta(hours=1), agora, validade)
    assert not regras.relato_antigo(agora - validade, agora, validade)


def test_relato_antigo_sem_fuso_conta_como_utc() -> None:
    agora = datetime(2026, 11, 10, 12, 0, tzinfo=UTC)
    validade = timedelta(hours=3)

    antigo = datetime(2026, 11, 10, 7, 0)
    recente = datetime(2026, 11, 10, 10, 0)

    assert regras.relato_antigo(antigo, agora, validade)
    assert not regras.relato_antigo(recente, agora, validade)
