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
ALFABETO_GEOHASH = "0123456789bcdefghjkmnpqrstuvwxyz"


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
        assert request.url.params["timezone"] == "auto"
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


async def test_open_meteo_com_niveis_de_pressao_detecta_inversao() -> None:
    previsao = _carregar("openmeteo_previsao.json")
    ar = _carregar("openmeteo_ar.json")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "air-quality-api.open-meteo.com":
            return httpx.Response(200, json=ar)
        assert "temperature_925hPa" in request.url.params["hourly"]
        assert "geopotential_height_850hPa" in request.url.params["hourly"]
        return httpx.Response(200, json=previsao)

    async with _cliente(handler) as cliente:
        leitura = await OpenMeteo(cliente).ler(GEOHASH5, LATITUDE, LONGITUDE)

    # 925 hPa a 885 m (> 737 m + 100 m) com 18,9 °C contra 16,1 °C a 2 m
    assert leitura.inversao_termica is True
    assert leitura.inversao_delta_c == pytest.approx(2.8)


async def test_open_meteo_sem_niveis_de_pressao_deixa_inversao_none() -> None:
    previsao = _carregar("openmeteo_previsao.json")
    previsao.pop("elevation")
    for campo in (
        "temperature_925hPa",
        "geopotential_height_925hPa",
        "temperature_850hPa",
        "geopotential_height_850hPa",
    ):
        previsao["hourly"].pop(campo)
    ar = _carregar("openmeteo_ar.json")
    handler = _handler(previsao=_resposta(previsao), ar=_resposta(ar))

    async with _cliente(handler) as cliente:
        leitura = await OpenMeteo(cliente).ler(GEOHASH5, LATITUDE, LONGITUDE)

    assert leitura.temperatura == pytest.approx(16.1)
    assert leitura.inversao_termica is None
    assert leitura.inversao_delta_c is None


async def test_open_meteo_niveis_nulos_deixam_inversao_none() -> None:
    previsao = _carregar("openmeteo_previsao.json")
    previsao["hourly"]["temperature_925hPa"] = [None] * 12
    previsao["hourly"].pop("temperature_850hPa")
    ar = _carregar("openmeteo_ar.json")
    handler = _handler(previsao=_resposta(previsao), ar=_resposta(ar))

    async with _cliente(handler) as cliente:
        leitura = await OpenMeteo(cliente).ler(GEOHASH5, LATITUDE, LONGITUDE)

    assert leitura.inversao_termica is None
    assert leitura.inversao_delta_c is None


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


def _pontos(quantidade: int) -> list[tuple[str, float, float]]:
    return [
        (
            f"6gy{ALFABETO_GEOHASH[i // 32]}{ALFABETO_GEOHASH[i % 32]}",
            LATITUDE + i * 0.001,
            LONGITUDE + i * 0.001,
        )
        for i in range(quantidade)
    ]


async def test_open_meteo_ler_varias_agrupa_coordenadas_numa_chamada() -> None:
    previsao = _carregar("openmeteo_previsao.json")
    ar = _carregar("openmeteo_ar.json")
    chamadas: list[tuple[str, str]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        chamadas.append((request.url.host, request.url.params["latitude"]))
        if request.url.host == "air-quality-api.open-meteo.com":
            return httpx.Response(200, json=[ar, ar, ar])
        return httpx.Response(200, json=[previsao, previsao, previsao])

    pontos = [
        ("6gycf", LATITUDE, LONGITUDE),
        ("6gyce", LATITUDE - 0.01, LONGITUDE - 0.01),
        ("6gycg", LATITUDE + 0.01, LONGITUDE + 0.01),
    ]

    async with _cliente(handler) as cliente:
        leituras = await OpenMeteo(cliente).ler_varias(pontos)

    hosts = [host for host, _ in chamadas]
    assert hosts.count("api.open-meteo.com") == 1
    assert hosts.count("air-quality-api.open-meteo.com") == 1
    assert set(leituras) == {geohash for geohash, _, _ in pontos}
    assert len(leituras) == 3

    latitudes = next(lat for host, lat in chamadas if host == "api.open-meteo.com")
    assert latitudes.split(",") == [str(latitude) for _, latitude, _ in pontos]


async def test_open_meteo_ler_varias_aceita_objeto_de_um_ponto() -> None:
    previsao = _carregar("openmeteo_previsao.json")
    ar = _carregar("openmeteo_ar.json")
    handler = _handler(previsao=_resposta(previsao), ar=_resposta(ar))

    async with _cliente(handler) as cliente:
        leituras = await OpenMeteo(cliente).ler_varias([(GEOHASH5, LATITUDE, LONGITUDE)])

    assert set(leituras) == {GEOHASH5}
    assert leituras[GEOHASH5].temperatura == pytest.approx(16.1)


async def test_open_meteo_ler_varias_divide_em_lotes_de_50() -> None:
    previsao = _carregar("openmeteo_previsao.json")
    ar = _carregar("openmeteo_ar.json")
    tamanhos: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        quantidade = len(request.url.params["latitude"].split(","))
        if request.url.host == "air-quality-api.open-meteo.com":
            return httpx.Response(200, json=[ar] * quantidade)
        tamanhos.append(quantidade)
        return httpx.Response(200, json=[previsao] * quantidade)

    pontos = _pontos(120)

    async with _cliente(handler) as cliente:
        leituras = await OpenMeteo(cliente).ler_varias(pontos)

    assert tamanhos == [50, 50, 20]
    assert len(leituras) == 120


async def test_open_meteo_erro_num_lote_nao_derruba_os_outros() -> None:
    previsao = _carregar("openmeteo_previsao.json")
    ar = _carregar("openmeteo_ar.json")
    chamadas_previsao = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal chamadas_previsao
        quantidade = len(request.url.params["latitude"].split(","))
        if request.url.host == "air-quality-api.open-meteo.com":
            return httpx.Response(200, json=[ar] * quantidade)
        chamadas_previsao += 1
        if chamadas_previsao == 1:
            return httpx.Response(500, json={})
        return httpx.Response(200, json=[previsao] * quantidade)

    pontos = _pontos(120)

    async with _cliente(handler) as cliente:
        leituras = await OpenMeteo(cliente).ler_varias(pontos)

    assert chamadas_previsao == 3
    assert len(leituras) == 70
    assert pontos[0][0] not in leituras
    assert pontos[49][0] not in leituras
    assert pontos[50][0] in leituras
    assert pontos[-1][0] in leituras


async def test_open_meteo_converte_horario_local_para_utc() -> None:
    previsao = _carregar("openmeteo_previsao.json")
    previsao["utc_offset_seconds"] = -10800
    previsao["current"]["time"] = "2026-11-10T21:00"
    inicio = datetime(2026, 11, 10, 21, 0)
    previsao["hourly"]["time"] = [(inicio + timedelta(hours=i)).isoformat() for i in range(12)]
    previsao["minutely_15"]["time"] = [
        (inicio + timedelta(minutes=15 * i)).isoformat() for i in range(12)
    ]
    ar = _carregar("openmeteo_ar.json")
    handler = _handler(previsao=_resposta(previsao), ar=_resposta(ar))

    async with _cliente(handler) as cliente:
        leitura = await OpenMeteo(cliente).ler(GEOHASH5, LATITUDE, LONGITUDE)

    assert leitura.medido_em == datetime(2026, 11, 11, 0, 0, tzinfo=UTC)
    assert leitura.proximas_horas[0].hora == datetime(2026, 11, 11, 0, 0, tzinfo=UTC)
    assert leitura.proximas_horas[-1].hora == datetime(2026, 11, 11, 11, 0, tzinfo=UTC)


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


async def test_simulador_madrugada_sem_chuva_gera_inversao() -> None:
    # 5h UTC = 2h em Brasília; onda de calor garante céu limpo (sem chuva).
    madrugada = datetime(2026, 11, 8, 5, 0, tzinfo=UTC)
    leitura = await Simulador(semente=3, onda_de_calor=True, agora=madrugada).ler(
        GEOHASH5, LATITUDE, LONGITUDE
    )

    assert leitura.chuva_mm_h == 0.0
    assert leitura.inversao_termica is True
    assert leitura.inversao_delta_c is not None
    assert 0.5 <= leitura.inversao_delta_c <= 4.0


async def test_simulador_durante_o_dia_nao_gera_inversao() -> None:
    # 14h30 UTC = 11h30 em Brasília.
    leitura = await Simulador(semente=3, agora=AGORA).ler(GEOHASH5, LATITUDE, LONGITUDE)

    assert leitura.inversao_termica is False
    assert leitura.inversao_delta_c is not None
    assert -8.0 <= leitura.inversao_delta_c <= -4.0
