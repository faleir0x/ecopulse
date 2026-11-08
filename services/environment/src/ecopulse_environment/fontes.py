"""Fontes de leitura ambiental."""

import asyncio
import random
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

import httpx

from ecopulse_common.events import HoraPrevista, LeituraAmbiente

URL_PREVISAO = "https://api.open-meteo.com/v1/forecast"
URL_AR = "https://air-quality-api.open-meteo.com/v1/air-quality"
TIMEOUT_S = 10.0

HORAS = 12
INTERVALOS_15MIN = 12


def _objeto(valor: Any, nome: str) -> dict[str, Any]:
    if not isinstance(valor, dict):
        raise ValueError(f"{nome} deveria ser um objeto")
    return valor


def _lista(valor: Any, nome: str) -> list[Any]:
    if not isinstance(valor, list):
        raise ValueError(f"{nome} deveria ser uma lista")
    return valor


def _numero(valor: Any, nome: str) -> float:
    if isinstance(valor, bool) or not isinstance(valor, int | float):
        raise ValueError(f"{nome} deveria ser numérico")
    return float(valor)


def _inteiro(valor: Any, nome: str) -> int:
    return round(_numero(valor, nome))


def _texto(valor: Any, nome: str) -> str:
    if not isinstance(valor, str):
        raise ValueError(f"{nome} deveria ser texto")
    return valor


def _data_hora(valor: Any, nome: str) -> datetime:
    quando = datetime.fromisoformat(_texto(valor, nome))
    if quando.tzinfo is None:
        return quando.replace(tzinfo=UTC)
    return quando.astimezone(UTC)


def _aqi(dados: dict[str, Any]) -> int:
    atual = _objeto(dados.get("current"), "current")
    return _inteiro(atual.get("us_aqi"), "current.us_aqi")


# Sub-índice US AQI de cada poluente → código que o app mostra
SUBINDICES = {
    "us_aqi_pm2_5": "pm2_5",
    "us_aqi_pm10": "pm10",
    "us_aqi_ozone": "ozonio",
    "us_aqi_nitrogen_dioxide": "no2",
    "us_aqi_sulphur_dioxide": "so2",
    "us_aqi_carbon_monoxide": "co",
}


def _poluente(dados: dict[str, Any]) -> str | None:
    """Poluente com o maior sub-índice (o que define o AQI); None sem dados."""
    atual = dados.get("current")
    if not isinstance(atual, dict):
        return None
    valores = {codigo: _opcional(atual.get(campo)) for campo, codigo in SUBINDICES.items()}
    presentes = {codigo: valor for codigo, valor in valores.items() if valor is not None}
    return max(presentes, key=lambda codigo: presentes[codigo]) if presentes else None


def _montar_leitura(
    dados: dict[str, Any],
    geohash5: str,
    latitude: float,
    longitude: float,
    aqi: int | None,
    poluente: str | None = None,
) -> LeituraAmbiente:
    atual = _objeto(dados.get("current"), "current")
    horaria = _objeto(dados.get("hourly"), "hourly")
    diaria = _objeto(dados.get("daily"), "daily")
    minutal = _objeto(dados.get("minutely_15"), "minutely_15")

    horas = _lista(horaria.get("time"), "hourly.time")
    temperaturas = _lista(horaria.get("temperature_2m"), "hourly.temperature_2m")
    codigos = _lista(horaria.get("weather_code"), "hourly.weather_code")
    chuvas = _lista(horaria.get("precipitation"), "hourly.precipitation")
    probabilidades = horaria.get("precipitation_probability")
    if not isinstance(probabilidades, list):
        probabilidades = []
    if min(len(horas), len(temperaturas), len(codigos), len(chuvas)) < HORAS:
        raise ValueError("previsão horária incompleta")

    proximas_horas = [
        HoraPrevista(
            hora=_data_hora(horas[i], "hourly.time"),
            temperatura=_numero(temperaturas[i], "hourly.temperature_2m"),
            codigo_tempo=_inteiro(codigos[i], "hourly.weather_code"),
            chuva_mm=_numero(chuvas[i], "hourly.precipitation"),
            prob_chuva=_percentual(probabilidades[i] if i < len(probabilidades) else None),
        )
        for i in range(HORAS)
    ]

    minutos = _lista(minutal.get("precipitation"), "minutely_15.precipitation")
    if len(minutos) < INTERVALOS_15MIN:
        raise ValueError("previsão de 15 min incompleta")
    chuva_3h = [
        _numero(minutos[i], "minutely_15.precipitation") * 4 for i in range(INTERVALOS_15MIN)
    ]

    minimas = _lista(diaria.get("temperature_2m_min"), "daily.temperature_2m_min")
    maximas = _lista(diaria.get("temperature_2m_max"), "daily.temperature_2m_max")
    if not minimas or not maximas:
        raise ValueError("previsão diária incompleta")

    chuva_mm_h = (
        chuva_3h[0] if chuva_3h else _numero(atual.get("precipitation"), "current.precipitation")
    )

    return LeituraAmbiente(
        geohash=geohash5,
        latitude=latitude,
        longitude=longitude,
        medido_em=_data_hora(atual.get("time"), "current.time"),
        fonte="open-meteo",
        temperatura=_numero(atual.get("temperature_2m"), "current.temperature_2m"),
        sensacao=_numero(atual.get("apparent_temperature"), "current.apparent_temperature"),
        codigo_tempo=_inteiro(atual.get("weather_code"), "current.weather_code"),
        minima_dia=_numero(minimas[0], "daily.temperature_2m_min"),
        maxima_dia=_numero(maximas[0], "daily.temperature_2m_max"),
        aqi=aqi,
        chuva_mm_h=chuva_mm_h,
        proximas_horas=proximas_horas,
        chuva_3h=chuva_3h,
        vento_kmh=_opcional(atual.get("wind_speed_10m")),
        vento_direcao=_direcao(atual.get("wind_direction_10m")),
        rajada_kmh=_opcional(atual.get("wind_gusts_10m")),
        umidade=_percentual(atual.get("relative_humidity_2m")),
        poluente=poluente,
    )


def _opcional(valor: Any) -> float | None:
    """Número ou None (campo ausente/nulo não derruba a leitura)."""
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        return None
    return round(float(valor), 1)


def _percentual(valor: Any) -> int | None:
    numero = _opcional(valor)
    return None if numero is None else max(0, min(100, round(numero)))


def _direcao(valor: Any) -> int | None:
    numero = _opcional(valor)
    return None if numero is None else round(numero) % 360


def _limitar(valor: float, minimo: float, maximo: float) -> float:
    return max(minimo, min(maximo, valor))


def _codigo_tempo(chuva: float, aleatorio: random.Random) -> int:
    if chuva <= 0:
        return aleatorio.choice((0, 1, 2, 3))
    if chuva < 1:
        return 51
    if chuva < 4:
        return 61
    return 80


class Fonte(Protocol):
    nome: str

    async def ler(self, geohash5: str, latitude: float, longitude: float) -> LeituraAmbiente: ...


class FonteIndisponivel(Exception):
    """A fonte externa falhou (rede, timeout, 5xx, resposta inesperada)."""


class OpenMeteo:
    """Open-Meteo (gratuita, sem chave). Duas chamadas em paralelo: previsão e qualidade do ar.

    Previsão: current=temperature_2m,apparent_temperature,weather_code,precipitation,
    wind_speed_10m,wind_direction_10m,wind_gusts_10m (km/h; vento é opcional);
    hourly=temperature_2m,weather_code,precipitation com forecast_hours=12;
    daily=temperature_2m_max,temperature_2m_min com forecast_days=1;
    minutely_15=precipitation com forecast_minutely_15=12; timezone=UTC.
    Ar: current=us_aqi.
    Se só a chamada do ar falhar, a leitura sai com aqi=None (o resto continua valendo).
    Qualquer outra falha → FonteIndisponivel.
    """

    nome = "open-meteo"

    def __init__(self, cliente: httpx.AsyncClient) -> None:
        self.cliente = cliente

    async def _buscar(self, url: str, parametros: dict[str, str | int | float]) -> dict[str, Any]:
        resposta = await self.cliente.get(url, params=parametros)
        resposta.raise_for_status()
        return _objeto(resposta.json(), "resposta")

    async def ler(self, geohash5: str, latitude: float, longitude: float) -> LeituraAmbiente:
        parametros_previsao: dict[str, str | int | float] = {
            "latitude": latitude,
            "longitude": longitude,
            "current": (
                "temperature_2m,apparent_temperature,weather_code,precipitation,"
                "wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m"
            ),
            "hourly": "temperature_2m,weather_code,precipitation,precipitation_probability",
            "forecast_hours": HORAS,
            "daily": "temperature_2m_max,temperature_2m_min",
            "forecast_days": 1,
            "minutely_15": "precipitation",
            "forecast_minutely_15": INTERVALOS_15MIN,
            "timezone": "UTC",
        }
        parametros_ar: dict[str, str | int | float] = {
            "latitude": latitude,
            "longitude": longitude,
            "current": "us_aqi," + ",".join(SUBINDICES),
            "timezone": "UTC",
        }

        resultados: list[dict[str, Any] | BaseException] = list(
            await asyncio.gather(
                self._buscar(URL_PREVISAO, parametros_previsao),
                self._buscar(URL_AR, parametros_ar),
                return_exceptions=True,
            )
        )
        previsao, ar = resultados

        if isinstance(previsao, BaseException):
            raise FonteIndisponivel(
                f"previsão indisponível: {type(previsao).__name__}: {previsao}"
            ) from previsao

        aqi: int | None = None
        poluente: str | None = None
        if not isinstance(ar, BaseException):
            try:
                aqi = _aqi(ar)
                poluente = _poluente(ar)
            except (KeyError, TypeError, ValueError):
                aqi = None

        try:
            return _montar_leitura(previsao, geohash5, latitude, longitude, aqi, poluente)
        except (KeyError, TypeError, ValueError, IndexError) as exc:
            raise FonteIndisponivel(f"resposta inesperada da previsão: {exc}") from exc


class Simulador:
    """Valores plausíveis para São Paulo, determinísticos por (geohash5, hora) com `semente`.

    Para a demonstração: `onda_de_calor=True` puxa temperatura para 34–38 °C, AQI para 150–220 e
    vento para 2–6 km/h, umidade para 15–28% e o poluente principal para PM2.5.
    """

    nome = "simulador"

    def __init__(
        self, semente: int = 0, onda_de_calor: bool = False, agora: datetime | None = None
    ) -> None:
        self.semente = semente
        self.onda_de_calor = onda_de_calor
        self._agora = agora
        self._aleatorio = random.Random(semente)  # noqa: S311 (dados simulados)

    async def ler(self, geohash5: str, latitude: float, longitude: float) -> LeituraAmbiente:
        agora = self._agora or datetime.now(UTC)
        agora = agora.replace(tzinfo=UTC) if agora.tzinfo is None else agora.astimezone(UTC)
        hora = agora.replace(minute=0, second=0, microsecond=0)

        aleatorio = random.Random(f"{self.semente}|{geohash5}|{hora.isoformat()}")  # noqa: S311

        if self.onda_de_calor:
            temperatura_base = aleatorio.uniform(35.0, 37.0)
            minimo, maximo = 34.0, 38.0
            aqi = aleatorio.randint(150, 220)
        else:
            temperatura_base = aleatorio.uniform(21.0, 27.0)
            minimo, maximo = 17.0, 30.0
            aqi = aleatorio.randint(20, 110)

        temperaturas: list[float] = []
        temperatura = temperatura_base
        for i in range(HORAS):
            if i:
                temperatura = _limitar(temperatura + aleatorio.uniform(-0.6, 0.6), minimo, maximo)
            temperaturas.append(round(temperatura, 1))

        sensacao = round(
            _limitar(temperatura_base + aleatorio.uniform(-1.0, 1.0), minimo, maximo), 1
        )
        minima_dia = round(
            _limitar(temperatura_base - aleatorio.uniform(1.5, 3.5), minimo, maximo), 1
        )
        maxima_dia = round(
            _limitar(temperatura_base + aleatorio.uniform(1.5, 3.5), minimo, maximo), 1
        )
        if minima_dia > maxima_dia:
            minima_dia, maxima_dia = maxima_dia, minima_dia

        if self.onda_de_calor:
            chuva_atual = 0.0
            chuva_3h = [0.0] * INTERVALOS_15MIN
            chuvas_hora = [0.0] * HORAS
        else:
            chuva_atual = round(aleatorio.uniform(0.0, 8.0), 2)

            chuva_3h = []
            valor = chuva_atual
            for i in range(INTERVALOS_15MIN):
                if i:
                    valor = _limitar(valor + aleatorio.uniform(-0.6, 0.6), 0.0, 8.0)
                chuva_3h.append(round(valor, 2))

            chuvas_hora = []
            valor = chuva_atual
            for i in range(HORAS):
                if i:
                    valor = _limitar(valor + aleatorio.uniform(-0.5, 0.5), 0.0, 8.0)
                chuvas_hora.append(round(valor, 2))

        proximas_horas = [
            HoraPrevista(
                hora=hora + timedelta(hours=i),
                temperatura=temperaturas[i],
                codigo_tempo=_codigo_tempo(chuvas_hora[i], aleatorio),
                chuva_mm=chuvas_hora[i],
                prob_chuva=(
                    aleatorio.randint(55, 90) if chuvas_hora[i] > 0 else aleatorio.randint(0, 25)
                ),
            )
            for i in range(HORAS)
        ]

        # Onda de calor vem com ar parado (vento fraco segura a poluição): bom para a demo
        vento = round(
            aleatorio.uniform(2.0, 6.0) if self.onda_de_calor else aleatorio.uniform(6.0, 20.0), 1
        )

        return LeituraAmbiente(
            geohash=geohash5,
            latitude=latitude,
            longitude=longitude,
            medido_em=hora,
            fonte="simulador",
            temperatura=temperaturas[0],
            sensacao=sensacao,
            codigo_tempo=_codigo_tempo(chuva_atual, aleatorio),
            minima_dia=minima_dia,
            maxima_dia=maxima_dia,
            aqi=aqi,
            chuva_mm_h=chuva_3h[0],
            proximas_horas=proximas_horas,
            chuva_3h=chuva_3h,
            vento_kmh=vento,
            vento_direcao=aleatorio.randrange(0, 360, 5),
            rajada_kmh=round(vento * aleatorio.uniform(1.4, 2.0), 1),
            # Onda de calor = ar seco (alerta abaixo de 30%) e fumaça (PM2.5)
            umidade=aleatorio.randint(15, 28) if self.onda_de_calor else aleatorio.randint(45, 85),
            poluente="pm2_5"
            if self.onda_de_calor
            else aleatorio.choice(["pm2_5", "pm10", "ozonio"]),
        )
