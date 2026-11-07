import pytest

from ecopulse_common.geohash import decode_bbox, encode, is_valid, neighbors

PONTOS = [
    (57.64911, 10.40744),
    (-23.5505, -46.6333),
    (0.0, 0.0),
    (48.8566, 2.3522),
    (-33.8688, 151.2093),
    (51.5074, -0.1278),
]


def _toca(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool:
    tol = 1e-9
    lat_sobrepoe = a[0] <= b[2] + tol and b[0] <= a[2] + tol
    lon_sobrepoe = a[1] <= b[3] + tol and b[1] <= a[3] + tol
    return lat_sobrepoe and lon_sobrepoe


def _contem(bbox: tuple[float, float, float, float], lat: float, lon: float) -> bool:
    tol = 1e-9
    return bbox[0] - tol <= lat <= bbox[2] + tol and bbox[1] - tol <= lon <= bbox[3] + tol


def test_encode_vetores_conhecidos() -> None:
    assert encode(57.64911, 10.40744, 11) == "u4pruydqqvj"
    assert encode(-23.5505, -46.6333, 6) == "6gyf4b"


def test_encode_precisao_padrao() -> None:
    assert len(encode(-23.5505, -46.6333)) == 6


@pytest.mark.parametrize(("lat", "lon"), PONTOS)
@pytest.mark.parametrize("precisao", [1, 4, 6, 8, 11])
def test_ida_e_volta_contem_o_ponto(lat: float, lon: float, precisao: int) -> None:
    bbox = decode_bbox(encode(lat, lon, precisao))
    assert _contem(bbox, lat, lon)


@pytest.mark.parametrize(("lat", "lon"), PONTOS)
def test_vizinhos_tocam_a_celula(lat: float, lon: float) -> None:
    geohash = encode(lat, lon, 6)
    original = decode_bbox(geohash)
    vizinhos = neighbors(geohash)

    assert len(vizinhos) == 8
    assert len(set(vizinhos)) == 8
    assert geohash not in vizinhos
    for vizinho in vizinhos:
        assert len(vizinho) == len(geohash)
        assert _toca(original, decode_bbox(vizinho))


def test_vizinhos_ordem_e_deslocamentos() -> None:
    geohash = encode(-23.5505, -46.6333, 6)
    norte, nordeste, leste, _sudeste, sul, sudoeste, oeste, noroeste = neighbors(geohash)
    original = decode_bbox(geohash)

    norte_bbox = decode_bbox(norte)
    sul_bbox = decode_bbox(sul)
    leste_bbox = decode_bbox(leste)
    oeste_bbox = decode_bbox(oeste)

    assert norte_bbox[0] >= original[0]
    assert sul_bbox[2] <= original[2]
    assert leste_bbox[1] >= original[1]
    assert oeste_bbox[3] <= original[3]
    assert decode_bbox(nordeste)[0] >= original[0]
    assert decode_bbox(nordeste)[1] >= original[1]
    assert decode_bbox(sudoeste)[2] <= original[2]
    assert decode_bbox(sudoeste)[3] <= original[3]
    assert nordeste not in {norte, leste}
    assert noroeste not in {norte, oeste}


def test_vizinhos_nos_polos_sao_omitidos() -> None:
    norte = neighbors(encode(90.0, 0.0, 6))
    sul = neighbors(encode(-90.0, 0.0, 6))

    assert len(norte) == 5
    assert len(sul) == 5
    assert len(set(norte)) == 5
    assert len(set(sul)) == 5


def test_vizinhos_dao_a_volta_na_linha_de_180() -> None:
    geohash = encode(0.0, 179.9999, 4)
    leste = neighbors(geohash)[2]
    assert decode_bbox(leste)[1] < -170.0

    oeste = neighbors(encode(0.0, -179.9999, 4))[6]
    assert decode_bbox(oeste)[3] > 170.0


@pytest.mark.parametrize(
    ("lat", "lon", "precisao"),
    [
        (91.0, 0.0, 6),
        (-91.0, 0.0, 6),
        (0.0, 181.0, 6),
        (0.0, -181.0, 6),
        (0.0, 0.0, 0),
        (0.0, 0.0, -1),
    ],
)
def test_encode_entradas_invalidas(lat: float, lon: float, precisao: int) -> None:
    with pytest.raises(ValueError):
        encode(lat, lon, precisao)


def test_encode_rejeita_nan_e_infinito() -> None:
    with pytest.raises(ValueError):
        encode(float("nan"), 0.0)
    with pytest.raises(ValueError):
        encode(0.0, float("inf"))


@pytest.mark.parametrize("geohash", ["", "u4pruydqqvj ", "a123", "u4pruydqqvjA", "u4pr uyd"])
def test_decode_bbox_invalido(geohash: str) -> None:
    with pytest.raises(ValueError):
        decode_bbox(geohash)


@pytest.mark.parametrize("geohash", ["", "a", "u4pruydqqvj ", "U4PRUYDQQVJ"])
def test_neighbors_invalido(geohash: str) -> None:
    with pytest.raises(ValueError):
        neighbors(geohash)


def test_is_valid() -> None:
    assert is_valid("u4pruydqqvj")
    assert is_valid("6gycfq")
    assert not is_valid("")
    assert not is_valid("a")
    assert not is_valid("U4PRUYDQQVJ")
    assert not is_valid("u4pruydqqv ")
