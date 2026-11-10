from datetime import UTC, datetime, timedelta
from typing import cast

import asyncpg
import pytest
from redis.asyncio.cluster import RedisCluster

from ecopulse_api import leitura
from ecopulse_common import geohash
from ecopulse_common.events import (
    OcorrenciaPayload,
    Severidade,
    StatusOcorrencia,
    TipoRisco,
)

LATITUDE = 38.72
LONGITUDE = -9.14


def _centro(celula: str) -> tuple[float, float]:
    lat_min, lon_min, lat_max, lon_max = geohash.decode_bbox(celula)
    return (lat_min + lat_max) / 2, (lon_min + lon_max) / 2


def _ocorrencia(
    ocorrencia_id: int,
    *,
    tipo: TipoRisco = TipoRisco.ALAGAMENTO,
    severidade: Severidade = Severidade.ALTO,
    latitude: float = LATITUDE,
    longitude: float = LONGITUDE,
    atualizada_em: datetime | None = None,
    expira_em: datetime | None = None,
) -> OcorrenciaPayload:
    quando = atualizada_em or datetime.now(UTC)
    return OcorrenciaPayload(
        id=ocorrencia_id,
        tipo=tipo,
        severidade=severidade,
        latitude=latitude,
        longitude=longitude,
        geohash=geohash.encode(latitude, longitude, geohash.CELL_PRECISION),
        confirmacoes=1,
        status=StatusOcorrencia.ATIVA,
        criada_em=quando,
        atualizada_em=quando,
        expira_em=expira_em or datetime.now(UTC) + timedelta(hours=1),
    )


def test_chave_celula_usa_hash_tag() -> None:
    assert leitura.chave_celula("eycs2") == "cell:{eycs2}:ocorrencias"


def test_bbox_pequeno_dentro_de_uma_celula() -> None:
    celula = geohash.encode(LATITUDE, LONGITUDE, geohash.PARTITION_PRECISION)
    lat_min, lon_min, lat_max, lon_max = geohash.decode_bbox(celula)
    largura = lon_max - lon_min
    altura = lat_max - lat_min
    lat_centro = (lat_min + lat_max) / 2
    lon_centro = (lon_min + lon_max) / 2

    celulas = leitura.celulas_do_bbox(
        lon_centro - largura / 10,
        lat_centro - altura / 10,
        lon_centro + largura / 10,
        lat_centro + altura / 10,
    )

    assert celulas == [celula]


def test_bbox_cobre_2x2_celulas_sem_repeticao() -> None:
    celula = geohash.encode(LATITUDE, LONGITUDE, geohash.PARTITION_PRECISION)
    norte, nordeste, leste = geohash.neighbors(celula)[:3]
    lat_celula, lon_celula = _centro(celula)
    lat_nordeste, lon_nordeste = _centro(nordeste)

    min_lon = min(lon_celula, lon_nordeste)
    min_lat = min(lat_celula, lat_nordeste)
    max_lon = max(lon_celula, lon_nordeste)
    max_lat = max(lat_celula, lat_nordeste)

    celulas = leitura.celulas_do_bbox(min_lon, min_lat, max_lon, max_lat)

    assert len(celulas) == 4
    assert len(celulas) == len(set(celulas))
    assert set(celulas) == {celula, norte, nordeste, leste}


def test_bbox_toda_celula_intersecta_e_cantos_estao_cobertos() -> None:
    celula = geohash.encode(LATITUDE, LONGITUDE, geohash.PARTITION_PRECISION)
    nordeste = geohash.neighbors(celula)[1]
    lat_celula, lon_celula = _centro(celula)
    lat_nordeste, lon_nordeste = _centro(nordeste)

    min_lon = min(lon_celula, lon_nordeste)
    min_lat = min(lat_celula, lat_nordeste)
    max_lon = max(lon_celula, lon_nordeste)
    max_lat = max(lat_celula, lat_nordeste)
    celulas = leitura.celulas_do_bbox(min_lon, min_lat, max_lon, max_lat)

    for encontrada in celulas:
        lat_min, lon_min, lat_max, lon_max = geohash.decode_bbox(encontrada)
        assert lon_min <= max_lon and lon_max >= min_lon
        assert lat_min <= max_lat and lat_max >= min_lat

    cantos = [
        (min_lat, min_lon),
        (min_lat, max_lon),
        (max_lat, min_lon),
        (max_lat, max_lon),
    ]
    for lat, lon in cantos:
        assert geohash.encode(lat, lon, geohash.PARTITION_PRECISION) in celulas


def test_bbox_de_um_ponto_retorna_uma_celula() -> None:
    celulas = leitura.celulas_do_bbox(LONGITUDE, LATITUDE, LONGITUDE, LATITUDE)

    assert celulas == [geohash.encode(LATITUDE, LONGITUDE, geohash.PARTITION_PRECISION)]


def test_amostragem_devolve_a_grade_completa_quando_cabe() -> None:
    celula = geohash.encode(LATITUDE, LONGITUDE, geohash.PARTITION_PRECISION)
    norte, nordeste, leste = geohash.neighbors(celula)[:3]
    caixas = [geohash.decode_bbox(item) for item in (celula, norte, nordeste, leste)]
    bbox = (
        min(caixa[1] for caixa in caixas),
        min(caixa[0] for caixa in caixas),
        max(caixa[3] for caixa in caixas),
        max(caixa[2] for caixa in caixas),
    )

    assert leitura.celulas_amostradas_do_bbox(*bbox) == leitura.celulas_do_bbox(*bbox)


def test_amostragem_limita_e_espalha_pelo_bbox_grande() -> None:
    # Estado de São Paulo inteiro: milhares de células na grade completa.
    min_lon, min_lat, max_lon, max_lat = -53.2, -25.4, -44.1, -19.7

    celulas = leitura.celulas_amostradas_do_bbox(min_lon, min_lat, max_lon, max_lat)

    assert 0 < len(celulas) <= leitura.MAX_CELULAS
    assert len(celulas) == len(set(celulas))

    meio_lon = (min_lon + max_lon) / 2
    meio_lat = (min_lat + max_lat) / 2
    quadrantes = {
        (lat >= meio_lat, lon >= meio_lon) for lat, lon in (_centro(celula) for celula in celulas)
    }
    assert quadrantes == {(False, False), (False, True), (True, False), (True, True)}


def test_amostragem_respeita_maximo_informado() -> None:
    celulas = leitura.celulas_amostradas_do_bbox(-53.2, -25.4, -44.1, -19.7, maximo=10)

    assert 0 < len(celulas) <= 10


@pytest.mark.parametrize(
    ("min_lon", "min_lat", "max_lon", "max_lat"),
    [
        (-9.0, 38.0, -9.1, 38.1),  # min_lon > max_lon (antimeridiano)
        (-9.1, 38.1, -9.0, 38.0),  # min_lat > max_lat
        (170.0, -1.0, -170.0, 1.0),  # min_lon > max_lon
        (-181.0, 0.0, 0.0, 1.0),  # longitude fora do intervalo
        (0.0, -91.0, 1.0, 0.0),  # latitude fora do intervalo
    ],
)
def test_amostragem_valida_bbox(
    min_lon: float, min_lat: float, max_lon: float, max_lat: float
) -> None:
    with pytest.raises(ValueError):
        leitura.celulas_amostradas_do_bbox(min_lon, min_lat, max_lon, max_lat)


def test_amostragem_exige_maximo_positivo() -> None:
    with pytest.raises(ValueError):
        leitura.celulas_amostradas_do_bbox(LONGITUDE, LATITUDE, LONGITUDE, LATITUDE, maximo=0)


@pytest.mark.parametrize(
    ("min_lon", "min_lat", "max_lon", "max_lat"),
    [
        (-9.0, 38.0, -9.1, 38.1),  # min_lon > max_lon (antimeridiano)
        (-9.1, 38.1, -9.0, 38.0),  # min_lat > max_lat
        (170.0, -1.0, -170.0, 1.0),  # min_lon > max_lon
        (-181.0, 0.0, 0.0, 1.0),  # longitude fora do intervalo
        (0.0, -91.0, 1.0, 0.0),  # latitude fora do intervalo
        (-180.0, -90.0, 180.0, 90.0),  # células demais
    ],
)
def test_bbox_invalido(min_lon: float, min_lat: float, max_lon: float, max_lat: float) -> None:
    with pytest.raises(ValueError):
        leitura.celulas_do_bbox(min_lon, min_lat, max_lon, max_lat)


def test_filtrar_bbox_tipo_e_ordem() -> None:
    base = datetime.now(UTC)
    critico = _ocorrencia(
        1,
        severidade=Severidade.CRITICO,
        latitude=38.73,
        longitude=-9.13,
        atualizada_em=base - timedelta(hours=1),
    )
    alto_recente = _ocorrencia(
        2, severidade=Severidade.ALTO, latitude=38.72, longitude=-9.14, atualizada_em=base
    )
    alto_antigo = _ocorrencia(
        3,
        severidade=Severidade.ALTO,
        latitude=38.72,
        longitude=-9.14,
        atualizada_em=base - timedelta(hours=2),
    )
    baixo = _ocorrencia(
        4, severidade=Severidade.BAIXO, latitude=38.72, longitude=-9.14, atualizada_em=base
    )
    fora = _ocorrencia(5, latitude=38.9, longitude=-9.4)
    de_calor = _ocorrencia(
        6,
        tipo=TipoRisco.CALOR,
        severidade=Severidade.BAIXO,
        atualizada_em=base - timedelta(hours=3),
    )

    ocorrencias = [baixo, alto_antigo, fora, critico, de_calor, alto_recente]

    filtradas = leitura.filtrar(ocorrencias, -9.15, 38.70, -9.12, 38.74, None)

    assert [ocorrencia.id for ocorrencia in filtradas] == [1, 2, 3, 4, 6]

    so_calor = leitura.filtrar(ocorrencias, -9.15, 38.70, -9.12, 38.74, TipoRisco.CALOR)

    assert [ocorrencia.id for ocorrencia in so_calor] == [6]


def test_filtrar_inclui_bordas() -> None:
    ocorrencia = _ocorrencia(1, latitude=38.70, longitude=-9.15)

    filtradas = leitura.filtrar([ocorrencia], -9.15, 38.70, -9.12, 38.74, None)

    assert [item.id for item in filtradas] == [1]


def test_filtrar_descarta_ocorrencia_vencida() -> None:
    agora = datetime.now(UTC)
    ativa = _ocorrencia(1)
    vencida = _ocorrencia(2).model_copy(update={"expira_em": agora - timedelta(seconds=1)})

    filtradas = leitura.filtrar([ativa, vencida], -9.15, 38.70, -9.12, 38.74, None)

    assert [item.id for item in filtradas] == [1]


def test_nota_publica_so_depois_de_outra_confirmacao() -> None:
    assert leitura.nota_publica("Rua tomada pela água", 1) is None
    assert leitura.nota_publica("Rua tomada pela água", 2) == "Rua tomada pela água"
    assert leitura.nota_publica("", 2) is None
    assert leitura.nota_publica("   ", 2) is None
    assert leitura.nota_publica(None, 2) is None


def test_nota_publica_remove_links_e_normaliza_espacos() -> None:
    nota = leitura.nota_publica("  Olha   https://golpe.example/abc  e  www.spam.test  agora  ", 2)

    assert nota == "Olha [link removido] e [link removido] agora"


class _ConexaoVazia:
    async def __aenter__(self) -> "_ConexaoVazia":
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def fetch(self, *_: object, **__: object) -> list[object]:
        return []


class _PoolVazio:
    def acquire(self) -> _ConexaoVazia:
        return _ConexaoVazia()


class _PipelineCache:
    def __init__(self, redis: "_RedisCache") -> None:
        self._redis = redis

    def set(self, chave: str, valor: str, ex: int | None = None) -> None:
        self._redis.gravadas.append(chave)

    def delete(self, *chaves: str) -> None:
        self._redis.gravadas.extend(chaves)

    async def execute(self) -> None:
        return None


class _RedisCache:
    def __init__(self, marca_suja: bool) -> None:
        self.marca_suja = marca_suja
        self.gravadas: list[str] = []

    async def mget_nonatomic(self, chaves: list[str]) -> list[str | None]:
        if all(chave.endswith(":ocorrencias") for chave in chaves):
            return [None] * len(chaves)
        return ["1" if self.marca_suja and chave.endswith(":sujo") else None for chave in chaves]

    def pipeline(self) -> _PipelineCache:
        return _PipelineCache(self)


async def _gravar_cache(marca_suja: bool) -> list[str]:
    redis = _RedisCache(marca_suja)
    await leitura.ocorrencias_por_celulas(
        cast(asyncpg.Pool, _PoolVazio()), cast(RedisCluster, redis), ["eycs2"]
    )
    return redis.gravadas


async def test_cache_nao_regrava_celula_marcada_como_suja() -> None:
    assert await _gravar_cache(marca_suja=True) == []
    assert await _gravar_cache(marca_suja=False) == ["cell:{eycs2}:ocorrencias"]
