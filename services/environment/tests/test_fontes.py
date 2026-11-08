import json
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from itertools import pairwise
from pathlib import Path
from typing import Any, cast

import httpx
import pytest

from ecopulse_environment.fontes import FonteIndisponivel, OpenMeteo, Simulador

DADOS = Path(__file__).parent / "dados"
GEOHASH5 = "6gycf"
LATITUDE = -23.5505
LONGITUDE = -46.6333
AGORA = datetime(2026, 11, 8, 14, 30, tzinfo=UTC)


def _carregar(nome: str) -> dict[str, Any]:
    return cast(dict[str, Any], json.loads((DADOS / nome).read_text(encoding="utf-8")))


def _cliente(handler: Callable[[httpx.Request], httpx.Response]) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _handler(
    *,
    previsao: Callable[[], httpx.Response],
    ar: Callable[[], httpx.Response],
) -> Callable[[httpx.Request], httpx.Response]:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "air-quality-api.open-meteo.com":
            return ar()
        return previsao()

    return handler


def _resposta(dados: dict[str, Any], status: int = 200) -> Callable[[], httpx.Response]:
    return lambda: httpx.Response(status, json=dados)


async def test_open_meteo_caso_completo() -> None:
    previsao = _carregar("openmeteo_previsao.json")
    ar = _carregar("openmeteo_ar.json")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "air-quality-api.open-meteo.com":
            assert request.url.params["current"].startswith("us_aqi,us_aqi_pm2_5")
            assert request.url.params["timezone"] == "UTC"
            return httpx.Response(200, json=ar)
        assert request.url.params["forecast_hours"] == "12"
        assert request.url.params["forecast_minutely_15"] == "12"
        assert request.url.params["timezone"] == "UTC"
        return httpx.Response(200, json=previsao)

    async with _cliente(handler) as cliente:
        leitura = await OpenMeteo(cliente).ler(GEOHASH5, LATITUDE, LONGITUDE)

    assert "wind_speed_10m" in previsao["current"]
    assert leitura.vento_kmh == 7.4
    assert leitura.vento_direcao == 132
    assert leitura.rajada_kmh == 18.0
    assert leitura.umidade == 27
    assert leitura.poluente == "pm2_5"
    assert [h.prob_chuva for h in leitura.proximas_horas][:4] == [10, 20, 35, 60]

    assert leitura.geohash == GEOHASH5
    assert leitura.latitude == LATITUDE
    assert leitura.longitude == LONGITUDE
    assert leitura.fonte == "open-meteo"
    assert leitura.medido_em == datetime(2026, 11, 8, 14, 0, tzinfo=UTC)
    assert leitura.temperatura == pytest.approx(16.1)
    assert leitura.sensacao == pytest.approx(15.7)
    assert leitura.codigo_tempo == 55
    assert leitura.minima_dia == pytest.approx(14.0)
    assert leitura.maxima_dia == pytest.approx(20.3)
    assert leitura.aqi == 53

    assert len(leitura.proximas_horas) == 12
    primeira = leitura.proximas_horas[0]
    assert primeira.hora == datetime(2026, 11, 8, 14, 0, tzinfo=UTC)
    assert primeira.temperatura == pytest.approx(16.1)
    assert primeira.codigo_tempo == 61
    assert primeira.chuva_mm == pytest.approx(1.3)
    assert leitura.proximas_horas[-1].hora == datetime(2026, 11, 9, 1, 0, tzinfo=UTC)

    assert leitura.chuva_3h == pytest.approx(
        [
            0.3 * 4,
            0.5 * 4,
            0.5 * 4,
            0.5 * 4,
            0.5 * 4,
            0.2 * 4,
            0.2 * 4,
            0.2 * 4,
            0.2 * 4,
            0.2 * 4,
            0.2 * 4,
            0.2 * 4,
        ]
    )
    assert leitura.chuva_mm_h == pytest.approx(1.2)


async def test_open_meteo_sem_vento_deixa_vento_none() -> None:
    previsao = _carregar("openmeteo_previsao.json")
    for campo in ("wind_speed_10m", "wind_direction_10m", "wind_gusts_10m"):
        previsao["current"].pop(campo)
    ar = _carregar("openmeteo_ar.json")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "air-quality-api.open-meteo.com":
            return httpx.Response(200, json=ar)
        return httpx.Response(200, json=previsao)

    async with _cliente(handler) as cliente:
        leitura = await OpenMeteo(cliente).ler(GEOHASH5, LATITUDE, LONGITUDE)

    assert leitura.vento_kmh is None
    assert leitura.vento_direcao is None
    assert leitura.rajada_kmh is None
    assert leitura.temperatura is not None


async def test_open_meteo_ar_falhando_deixa_aqi_none() -> None:
    previsao = _carregar("openmeteo_previsao.json")
    handler = _handler(previsao=_resposta(previsao), ar=_resposta({}, status=503))

    async with _cliente(handler) as cliente:
        leitura = await OpenMeteo(cliente).ler(GEOHASH5, LATITUDE, LONGITUDE)

    assert leitura.aqi is None
    assert leitura.temperatura == pytest.approx(16.1)
    assert len(leitura.proximas_horas) == 12


async def test_open_meteo_ar_com_json_inesperado_deixa_aqi_none() -> None:
    previsao = _carregar("openmeteo_previsao.json")
    handler = _handler(previsao=_resposta(previsao), ar=_resposta({"current": {}}))

    async with _cliente(handler) as cliente:
        leitura = await OpenMeteo(cliente).ler(GEOHASH5, LATITUDE, LONGITUDE)

    assert leitura.aqi is None


async def test_open_meteo_previsao_falhando_levanta_fonte_indisponivel() -> None:
    ar = _carregar("openmeteo_ar.json")
    handler = _handler(previsao=_resposta({}, status=500), ar=_resposta(ar))

    async with _cliente(handler) as cliente:
        with pytest.raises(FonteIndisponivel):
            await OpenMeteo(cliente).ler(GEOHASH5, LATITUDE, LONGITUDE)


async def test_open_meteo_json_inesperado_levanta_fonte_indisponivel() -> None:
    ar = _carregar("openmeteo_ar.json")
    handler = _handler(previsao=_resposta({"current": {}}), ar=_resposta(ar))

    async with _cliente(handler) as cliente:
        with pytest.raises(FonteIndisponivel):
            await OpenMeteo(cliente).ler(GEOHASH5, LATITUDE, LONGITUDE)


async def test_simulador_e_deterministico_por_semente_celula_e_hora() -> None:
    fonte = Simulador(semente=7, agora=AGORA)

    primeira = await fonte.ler(GEOHASH5, LATITUDE, LONGITUDE)
    segunda = await fonte.ler(GEOHASH5, LATITUDE, LONGITUDE)

    assert primeira == segunda
    assert primeira.fonte == "simulador"


async def test_simulador_faixas_normais() -> None:
    leitura = await Simulador(semente=1, agora=AGORA).ler(GEOHASH5, LATITUDE, LONGITUDE)

    assert leitura.temperatura is not None
    assert leitura.sensacao is not None
    assert leitura.minima_dia is not None
    assert leitura.maxima_dia is not None
    assert leitura.aqi is not None
    assert leitura.chuva_mm_h is not None

    assert 17.0 <= leitura.temperatura <= 30.0
    assert 17.0 <= leitura.sensacao <= 30.0
    assert 17.0 <= leitura.minima_dia <= leitura.maxima_dia <= 30.0
    assert 20 <= leitura.aqi <= 110
    assert 0.0 <= leitura.chuva_mm_h <= 8.0

    assert len(leitura.proximas_horas) == 12
    assert len(leitura.chuva_3h) == 12
    for hora in leitura.proximas_horas:
        assert 17.0 <= hora.temperatura <= 30.0
        assert 0.0 <= hora.chuva_mm <= 8.0
    for chuva in leitura.chuva_3h:
        assert 0.0 <= chuva <= 8.0


async def test_simulador_onda_de_calor() -> None:
    leitura = await Simulador(semente=3, onda_de_calor=True, agora=AGORA).ler(
        GEOHASH5, LATITUDE, LONGITUDE
    )

    assert leitura.temperatura is not None
    assert leitura.sensacao is not None
    assert leitura.minima_dia is not None
    assert leitura.maxima_dia is not None
    assert leitura.aqi is not None
    assert leitura.chuva_mm_h is not None

    assert 34.0 <= leitura.temperatura <= 38.0
    assert 34.0 <= leitura.sensacao <= 38.0
    assert 34.0 <= leitura.minima_dia <= leitura.maxima_dia <= 38.0
    assert 150 <= leitura.aqi <= 220
    assert leitura.vento_kmh is not None and 2.0 <= leitura.vento_kmh <= 6.0
    assert leitura.umidade is not None and leitura.umidade < 30
    assert leitura.poluente == "pm2_5"
    assert leitura.chuva_mm_h == 0.0
    assert all(chuva == 0.0 for chuva in leitura.chuva_3h)
    assert all(hora.chuva_mm == 0.0 for hora in leitura.proximas_horas)
    for hora in leitura.proximas_horas:
        assert 34.0 <= hora.temperatura <= 38.0


async def test_simulador_previsao_coerente() -> None:
    leitura = await Simulador(semente=5, agora=AGORA).ler(GEOHASH5, LATITUDE, LONGITUDE)

    hora_base = AGORA.replace(minute=0, second=0, microsecond=0)
    assert [hora.hora for hora in leitura.proximas_horas] == [
        hora_base + timedelta(hours=i) for i in range(12)
    ]

    for anterior, seguinte in pairwise(leitura.proximas_horas):
        assert abs(seguinte.temperatura - anterior.temperatura) <= 1.0
        assert abs(seguinte.chuva_mm - anterior.chuva_mm) <= 1.0
    for chuva_anterior, chuva_seguinte in pairwise(leitura.chuva_3h):
        assert abs(chuva_seguinte - chuva_anterior) <= 1.0
