import json
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any, cast
from unittest.mock import MagicMock

import asyncpg
import httpx
import pytest
from fastapi.testclient import TestClient
from redis.asyncio.cluster import RedisCluster

from ecopulse_api import main, rotas
from ecopulse_api.schemas import ModoRota, RotaSegura
from ecopulse_common import geohash
from ecopulse_common.config import Settings
from ecopulse_common.events import (
    OcorrenciaPayload,
    Severidade,
    StatusOcorrencia,
    TipoRisco,
)

ORIGEM = (0.0, 0.0)
DESTINO = (0.0, 0.02)
BASE_URL = "https://ors.test"
CHAVE = "chave-de-teste"

DIRETA_LONLAT = [[0.0, 0.0], [0.02, 0.0]]
SEGURA_LONLAT = [[0.0, 0.0], [0.005, 0.01], [0.015, 0.01], [0.02, 0.0]]
DIRETA_LATLON = [(0.0, 0.0), (0.0, 0.02)]
SEGURA_LATLON = [(0.0, 0.0), (0.01, 0.005), (0.01, 0.015), (0.0, 0.02)]

POOL_FALSO = cast(asyncpg.Pool, object())


class RedisFalso:
    def __init__(self) -> None:
        self.dados: dict[str, str] = {}
        self.ttls: dict[str, int] = {}

    async def get(self, chave: str) -> str | None:
        return self.dados.get(chave)

    async def set(self, chave: str, valor: str, ex: int | None = None) -> bool:
        self.dados[chave] = valor
        if ex is not None:
            self.ttls[chave] = ex
        return True


def _ocorrencia(
    ocorrencia_id: int,
    severidade: Severidade,
    latitude: float,
    longitude: float,
    *,
    tipo: TipoRisco = TipoRisco.ALAGAMENTO,
) -> OcorrenciaPayload:
    quando = datetime(2026, 11, 8, 12, tzinfo=UTC)
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
        expira_em=quando + timedelta(hours=1),
    )


def _sem_banco(monkeypatch: pytest.MonkeyPatch, ocorrencias: list[OcorrenciaPayload]) -> None:
    async def fake(
        pool: asyncpg.Pool, origem: rotas.Coordenada, destino: rotas.Coordenada
    ) -> list[OcorrenciaPayload]:
        del pool, origem, destino
        return ocorrencias

    monkeypatch.setattr(rotas, "ocorrencias_ativas", fake)


def _rota_json(coordenadas: list[list[float]], distancia: float, duracao: float) -> dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"summary": {"distance": distancia, "duration": duracao}},
                "geometry": {"type": "LineString", "coordinates": coordenadas},
            }
        ],
    }


def _handler_padrao(
    chamadas: list[dict[str, Any]],
    *,
    sem_rota_segura: bool = False,
) -> Callable[[httpx.Request], httpx.Response]:
    def handler(request: httpx.Request) -> httpx.Response:
        corpo = cast(dict[str, Any], json.loads(request.content))
        chamadas.append(corpo)
        if "options" in corpo:
            if sem_rota_segura:
                return httpx.Response(
                    404, json={"error": {"code": 2009, "message": "Route could not be found"}}
                )
            return httpx.Response(200, json=_rota_json(SEGURA_LONLAT, 3000.0, 600.0))
        return httpx.Response(200, json=_rota_json(DIRETA_LONLAT, 2224.0, 300.0))

    return handler


async def _calcular(
    cliente: httpx.AsyncClient,
    *,
    redis: RedisFalso | None = None,
    origem: rotas.Coordenada = ORIGEM,
    destino: rotas.Coordenada = DESTINO,
    modo: ModoRota = "pedestre",
    chave: str = CHAVE,
) -> RotaSegura:
    return await rotas.rota_segura(
        POOL_FALSO,
        cast(RedisCluster, redis or RedisFalso()),
        cliente,
        origem,
        destino,
        modo,
        chave=chave,
        base_url=BASE_URL,
    )


async def test_rota_segura_evita_duas_ocorrencias_e_compara_com_a_direta(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _sem_banco(
        monkeypatch,
        [
            _ocorrencia(1, Severidade.ALTO, 0.0, 0.009),
            _ocorrencia(2, Severidade.CRITICO, 0.0, 0.011, tipo=TipoRisco.ROTA_OBSTRUIDA),
        ],
    )
    chamadas: list[dict[str, Any]] = []
    handler = _handler_padrao(chamadas)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cliente:
        resultado = await _calcular(cliente)

    assert resultado.modo == "pedestre"
    assert resultado.distancia_m == pytest.approx(3000.0)
    assert resultado.duracao_s == pytest.approx(600.0)
    assert resultado.coordenadas == SEGURA_LATLON
    assert [item.id for item in resultado.evitadas] == [1, 2]
    assert [item.tipo for item in resultado.evitadas] == [
        TipoRisco.ALAGAMENTO,
        TipoRisco.ROTA_OBSTRUIDA,
    ]
    assert resultado.direta is not None
    assert resultado.direta.distancia_m == pytest.approx(2224.0)
    assert resultado.direta.duracao_s == pytest.approx(300.0)
    assert resultado.direta.atravessa == [1, 2]
    assert resultado.direta.coordenadas == DIRETA_LATLON
    assert resultado.no_caminho == []
    assert resultado.sem_desvio is False
    assert resultado.aviso is None
    assert len(chamadas) == 2

    com_avoid = next(corpo for corpo in chamadas if "options" in corpo)
    avoid = com_avoid["options"]["avoid_polygons"]
    assert avoid["type"] == "MultiPolygon"
    assert len(avoid["coordinates"]) == 2
    for poligono in avoid["coordinates"]:
        anel = poligono[0]
        assert len(anel) == rotas.POLIGONO_LADOS + 1
        assert anel[0] == anel[-1]


async def test_sem_ocorrencias_faz_uma_chamada_e_nao_tem_direta(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _sem_banco(monkeypatch, [])
    chamadas: list[dict[str, Any]] = []
    handler = _handler_padrao(chamadas)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cliente:
        resultado = await _calcular(cliente)

    assert len(chamadas) == 1
    assert "options" not in chamadas[0]
    assert resultado.coordenadas == DIRETA_LATLON
    assert resultado.evitadas == []
    assert resultado.direta is None
    assert resultado.aviso is None


async def test_ocorrencia_baixa_nao_gera_zona_a_evitar(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _sem_banco(monkeypatch, [_ocorrencia(1, Severidade.BAIXO, 0.0, 0.01)])
    chamadas: list[dict[str, Any]] = []
    handler = _handler_padrao(chamadas)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cliente:
        resultado = await _calcular(cliente)

    assert len(chamadas) == 1
    assert resultado.direta is None
    assert resultado.evitadas == []


async def test_origem_dentro_de_zona_gera_aviso_e_fica_fora_do_avoid(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _sem_banco(
        monkeypatch,
        [
            _ocorrencia(1, Severidade.ALTO, 0.0, 0.0),
            _ocorrencia(2, Severidade.CRITICO, 0.0, 0.011),
        ],
    )
    chamadas: list[dict[str, Any]] = []
    handler = _handler_padrao(chamadas)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cliente:
        resultado = await _calcular(cliente)

    assert resultado.aviso == rotas.AVISO_ORIGEM
    assert [item.id for item in resultado.evitadas] == [2]
    assert [item.id for item in resultado.no_caminho] == [1]
    assert resultado.sem_desvio is False
    assert resultado.direta is not None
    assert resultado.direta.atravessa == [1, 2]

    com_avoid = next(corpo for corpo in chamadas if "options" in corpo)
    poligonos = com_avoid["options"]["avoid_polygons"]["coordinates"]
    assert len(poligonos) == 1
    media_lon = sum(ponto[0] for ponto in poligonos[0][0][:-1]) / rotas.POLIGONO_LADOS
    assert media_lon == pytest.approx(0.011, abs=0.001)


async def test_ors_500_levanta_indisponivel(monkeypatch: pytest.MonkeyPatch) -> None:
    _sem_banco(monkeypatch, [_ocorrencia(1, Severidade.ALTO, 0.0, 0.01)])

    def handler(request: httpx.Request) -> httpx.Response:
        del request
        return httpx.Response(500, json={"error": {"code": 2099}})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cliente:
        with pytest.raises(rotas.OrsIndisponivel):
            await _calcular(cliente)


async def test_ors_sem_rota_evitando_devolve_a_direta_com_aviso(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _sem_banco(monkeypatch, [_ocorrencia(1, Severidade.ALTO, 0.0, 0.01)])
    chamadas: list[dict[str, Any]] = []
    handler = _handler_padrao(chamadas, sem_rota_segura=True)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cliente:
        resultado = await _calcular(cliente)

    assert resultado.coordenadas == DIRETA_LATLON
    assert resultado.distancia_m == pytest.approx(2224.0)
    assert resultado.evitadas == []
    assert resultado.direta is not None
    assert resultado.direta.atravessa == [1]
    assert resultado.direta.coordenadas == DIRETA_LATLON
    assert resultado.sem_desvio is True
    assert [(item.id, item.latitude, item.longitude) for item in resultado.no_caminho] == [
        (1, 0.0, 0.01)
    ]
    assert resultado.aviso == rotas.AVISO_SEM_ROTA
    assert len(chamadas) == 2


async def test_cache_evita_segunda_chamada_ao_ors(monkeypatch: pytest.MonkeyPatch) -> None:
    _sem_banco(monkeypatch, [_ocorrencia(1, Severidade.ALTO, 0.0, 0.01)])
    redis = RedisFalso()
    chamadas: list[dict[str, Any]] = []
    handler = _handler_padrao(chamadas)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as cliente:
        primeira = await _calcular(cliente, redis=redis)
        chamadas_apos_primeira = len(chamadas)
        segunda = await _calcular(cliente, redis=redis)

    assert chamadas_apos_primeira == 2
    assert len(chamadas) == 2
    assert segunda == primeira
    assert redis.ttls
    assert set(redis.ttls.values()) == {rotas.CACHE_TTL_S}


async def test_distancia_grande_demais(monkeypatch: pytest.MonkeyPatch) -> None:
    _sem_banco(monkeypatch, [])

    async with httpx.AsyncClient(transport=httpx.MockTransport(_handler_padrao([]))) as cliente:
        with pytest.raises(rotas.DistanciaGrandeDemais):
            await _calcular(cliente, origem=(0.0, 0.0), destino=(0.0, 1.0))


def _preparar_app() -> None:
    main.app.state.pool = POOL_FALSO
    main.app.state.redis = cast(RedisCluster, RedisFalso())


def test_endpoint_sem_chave_retorna_503(limitador_falso: Any) -> None:
    _preparar_app()
    main.app.dependency_overrides[rotas.obter_settings] = lambda: Settings(ors_api_key="")
    try:
        cliente = TestClient(main.app)
        resposta = cliente.get("/v1/rotas", params={"origem": "0,0", "destino": "0,0.02"})
    finally:
        main.app.dependency_overrides.clear()

    assert resposta.status_code == 503
    assert resposta.json() == {"detail": "rotas indisponíveis"}


@pytest.mark.parametrize(
    ("origem", "destino"),
    [
        ("abc", "0,0"),
        ("91,0", "0,0"),
        ("0,181", "0,0"),
        ("0,0", "0,1"),
    ],
)
def test_endpoint_validacao_retorna_422(origem: str, destino: str, limitador_falso: Any) -> None:
    _preparar_app()
    main.app.dependency_overrides[rotas.obter_settings] = lambda: Settings(ors_api_key=CHAVE)
    try:
        cliente = TestClient(main.app)
        resposta = cliente.get("/v1/rotas", params={"origem": origem, "destino": destino})
    finally:
        main.app.dependency_overrides.clear()

    assert resposta.status_code == 422


class ClienteOrsQuebrado:
    async def post(self, *_: Any, **__: Any) -> httpx.Response:
        return httpx.Response(500, json={"error": {"code": 2099}})


def test_endpoint_ors_500_retorna_503_com_retry_after(
    monkeypatch: pytest.MonkeyPatch, limitador_falso: Any
) -> None:
    _sem_banco(monkeypatch, [_ocorrencia(1, Severidade.ALTO, 0.0, 0.01)])
    _preparar_app()
    main.app.dependency_overrides[rotas.obter_settings] = lambda: Settings(ors_api_key=CHAVE)
    main.app.dependency_overrides[rotas.obter_cliente_ors] = lambda: cast(
        httpx.AsyncClient, ClienteOrsQuebrado()
    )
    try:
        cliente = TestClient(main.app)
        resposta = cliente.get("/v1/rotas", params={"origem": "0,0", "destino": "0,0.02"})
    finally:
        main.app.dependency_overrides.clear()

    assert resposta.status_code == 503
    assert resposta.headers["Retry-After"] == "30"


def test_endpoint_rota_respeita_balde_do_ip(
    monkeypatch: pytest.MonkeyPatch, limitador_falso: Any
) -> None:
    chamadas: list[Any] = []

    async def fake_rota_segura(*args: Any, **_: Any) -> None:
        chamadas.append(args)

    monkeypatch.setattr(rotas, "rota_segura", fake_rota_segura)
    limitador_falso.negar("rota", 13)
    main.app.state.pool = MagicMock()
    main.app.dependency_overrides[rotas.obter_settings] = lambda: Settings(ors_api_key="teste")
    try:
        resposta = TestClient(main.app).get(
            "/v1/rotas", params={"origem": "-23.56,-46.65", "destino": "-23.55,-46.64"}
        )
    finally:
        main.app.dependency_overrides.pop(rotas.obter_settings, None)

    assert resposta.status_code == 429
    assert resposta.headers["retry-after"] == "13"
    assert limitador_falso.chamadas == [("rota", "testclient")]
    assert chamadas == []
