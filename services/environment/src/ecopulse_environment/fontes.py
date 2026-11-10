"""Fontes de leitura ambiental."""

import asyncio
import logging
import random
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

import httpx

from ecopulse_common.events import HoraPrevista, LeituraAmbiente
from ecopulse_environment.inversao import avaliar_inversao

log = logging.getLogger(__name__)

URL_PREVISAO = "https://api.open-meteo.com/v1/forecast"
URL_AR = "https://air-quality-api.open-meteo.com/v1/air-quality"
TIMEOUT_S = 10.0
LOTE_OPEN_METEO = 50

HORAS = 12
INTERVALOS_15MIN = 12
FUSO_BRASILIA = timedelta(hours=-3)


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


def _horario_utc(valor: Any, deslocamento: timedelta) -> Any:
    """Horário local da Open-Meteo (sem fuso) → ISO 8601 em UTC."""
    if not isinstance(valor, str):
        return valor
    quando = datetime.fromisoformat(valor)
    if quando.tzinfo is not None:
        return quando.astimezone(UTC).isoformat()
    return (quando - deslocamento).replace(tzinfo=UTC).isoformat()


def _em_utc(dados: dict[str, Any]) -> dict[str, Any]:
    """Converte os horários de current/hourly/minutely_15 do fuso local para UTC.

    Com timezone=auto a resposta traz horários locais sem fuso e utc_offset_seconds por local.
    daily fica como está: as datas (e a mínima/máxima) já são do dia local.
    """
    deslocamento_s = dados.get("utc_offset_seconds", 0)
    if isinstance(deslocamento_s, bool) or not isinstance(deslocamento_s, int | float):
        deslocamento_s = 0
    deslocamento = timedelta(seconds=deslocamento_s)
    if not deslocamento:
        return dados

    ajustado = dict(dados)
    for secao in ("current", "hourly", "minutely_15"):
        bloco = dados.get(secao)
        if not isinstance(bloco, dict):
            continue
        copia = dict(bloco)
        tempos = bloco.get("time")
        if isinstance(tempos, list):
            copia["time"] = [_horario_utc(tempo, deslocamento) for tempo in tempos]
        elif isinstance(tempos, str):
            copia["time"] = _horario_utc(tempos, deslocamento)
        else:
            continue
        ajustado[secao] = copia
    return ajustado


def _normalizar_resposta(valor: Any) -> list[dict[str, Any]]:
    """Objeto (uma coordenada) ou lista (várias coordenadas) → lista de objetos."""
    if isinstance(valor, dict):
        return [_objeto(valor, "resposta")]
    return [_objeto(item, "resposta") for item in _lista(valor, "resposta")]


def _coordenadas(valores: list[float]) -> str:
    return ",".join(str(valor) for valor in valores)


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

    niveis = [
        (
            _primeiro(horaria.get("temperature_925hPa")),
            _primeiro(horaria.get("geopotential_height_925hPa")),
        ),
        (
            _primeiro(horaria.get("temperature_850hPa")),
            _primeiro(horaria.get("geopotential_height_850hPa")),
        ),
    ]
    inversao_termica, inversao_delta_c = avaliar_inversao(
        _opcional(atual.get("temperature_2m")),
        _opcional(dados.get("elevation")),
        niveis,
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
        inversao_termica=inversao_termica,
        inversao_delta_c=inversao_delta_c,
    )


def _opcional(valor: Any) -> float | None:
    """Número ou None (campo ausente/nulo não derruba a leitura)."""
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        return None
    return round(float(valor), 1)


def _primeiro(valor: Any) -> float | None:
    """Primeiro item de uma série horária ou None (série ausente/vazia)."""
    if not isinstance(valor, list) or not valor:
        return None
    return _opcional(valor[0])


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

    async def ler_varias(
        self, pontos: list[tuple[str, float, float]]
    ) -> dict[str, LeituraAmbiente]: ...


class FonteIndisponivel(Exception):
    """A fonte externa falhou (rede, timeout, 5xx, resposta inesperada)."""


class OpenMeteo:
    """Open-Meteo (gratuita, sem chave). Por lote, duas chamadas em paralelo: previsão e ar.

    As coordenadas vão numa só chamada por lote (até LOTE_OPEN_METEO), separadas por vírgula;
    a resposta vem como lista (ou objeto quando há uma coordenada só). Previsão:
    current=temperature_2m,apparent_temperature,weather_code,precipitation,
    wind_speed_10m,wind_direction_10m,wind_gusts_10m (km/h; vento é opcional);
    hourly=temperature_2m,weather_code,precipitation,temperature_925hPa,temperature_850hPa,
    geopotential_height_925hPa,geopotential_height_850hPa com forecast_hours=12 (níveis de
    pressão alimentam a detecção de inversão térmica; ausentes viram None);
    daily=temperature_2m_max,temperature_2m_min com forecast_days=1;
    minutely_15=precipitation com forecast_minutely_15=12; timezone=auto (horários locais
    convertidos para UTC com utc_offset_seconds). Ar: current=us_aqi.
    Se só a chamada do ar falhar, as leituras saem com aqi=None (o resto continua valendo).
    Falha de previsão num lote → os pontos desse lote ficam de fora (os outros lotes seguem).
    """

    nome = "open-meteo"

    def __init__(self, cliente: httpx.AsyncClient) -> None:
        self.cliente = cliente

    async def _buscar(
        self, url: str, parametros: dict[str, str | int | float]
    ) -> list[dict[str, Any]]:
        resposta = await self.cliente.get(url, params=parametros)
        resposta.raise_for_status()
        return _normalizar_resposta(resposta.json())

    async def _ler_lote(self, lote: list[tuple[str, float, float]]) -> dict[str, LeituraAmbiente]:
        latitude = _coordenadas([latitude for _, latitude, _ in lote])
        longitude = _coordenadas([longitude for _, _, longitude in lote])
        parametros_previsao: dict[str, str | int | float] = {
            "latitude": latitude,
            "longitude": longitude,
            "current": (
                "temperature_2m,apparent_temperature,weather_code,precipitation,"
                "wind_speed_10m,wind_direction_10m,wind_gusts_10m,relative_humidity_2m"
            ),
            "hourly": (
                "temperature_2m,weather_code,precipitation,precipitation_probability,"
                "temperature_925hPa,temperature_850hPa,"
                "geopotential_height_925hPa,geopotential_height_850hPa"
            ),
            "forecast_hours": HORAS,
            "daily": "temperature_2m_max,temperature_2m_min",
            "forecast_days": 1,
            "minutely_15": "precipitation",
            "forecast_minutely_15": INTERVALOS_15MIN,
            "timezone": "auto",
        }
        parametros_ar: dict[str, str | int | float] = {
            "latitude": latitude,
            "longitude": longitude,
            "current": "us_aqi," + ",".join(SUBINDICES),
            "timezone": "UTC",
        }

        resultados: list[list[dict[str, Any]] | BaseException] = list(
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
        if len(previsao) != len(lote):
            raise FonteIndisponivel(
                f"previsão devolveu {len(previsao)} resultados para {len(lote)} coordenadas"
            )

        respostas_ar: list[dict[str, Any]] = [] if isinstance(ar, BaseException) else ar
        leituras: dict[str, LeituraAmbiente] = {}
        for indice, ((geohash5, lat, lon), dados) in enumerate(zip(lote, previsao, strict=True)):
            aqi: int | None = None
            poluente: str | None = None
            if indice < len(respostas_ar):
                try:
                    aqi = _aqi(respostas_ar[indice])
                    poluente = _poluente(respostas_ar[indice])
                except (KeyError, TypeError, ValueError):
                    aqi = None

            try:
                leituras[geohash5] = _montar_leitura(
                    _em_utc(dados), geohash5, lat, lon, aqi, poluente
                )
            except (KeyError, TypeError, ValueError, IndexError) as exc:
                log.warning(
                    "resposta inesperada da previsão; célula fica para a próxima rodada",
                    extra={"geohash": geohash5, "erro": str(exc)},
                )
        return leituras

    async def ler_varias(
        self, pontos: list[tuple[str, float, float]]
    ) -> dict[str, LeituraAmbiente]:
        leituras: dict[str, LeituraAmbiente] = {}
        for inicio in range(0, len(pontos), LOTE_OPEN_METEO):
            lote = pontos[inicio : inicio + LOTE_OPEN_METEO]
            try:
                leituras.update(await self._ler_lote(lote))
            except FonteIndisponivel as exc:
                log.warning(
                    "lote da Open-Meteo indisponível; células ficam para a próxima rodada",
                    extra={"total": len(lote), "erro": str(exc)},
                )
        return leituras

    async def ler(self, geohash5: str, latitude: float, longitude: float) -> LeituraAmbiente:
        leituras = await self.ler_varias([(geohash5, latitude, longitude)])
        leitura = leituras.get(geohash5)
        if leitura is None:
            raise FonteIndisponivel(f"leitura indisponível para {geohash5}")
        return leitura


class Simulador:
    """Valores plausíveis para São Paulo, determinísticos por (geohash5, hora) com `semente`.

    Para a demonstração: `onda_de_calor=True` puxa temperatura para 34–38 °C, AQI para 150–220 e
    vento para 2–6 km/h, umidade para 15–28% e o poluente principal para PM2.5.
    Inversão térmica: madrugada (0h–8h de Brasília) sem chuva tem delta de +0,5 a +4,0 °C;
    fora disso, delta de −8,0 a −4,0 °C (sem inversão).
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

        # Madrugada (horário de Brasília) sem chuva: o solo esfria e o ar acima fica mais quente
        hora_local = (hora + FUSO_BRASILIA).hour
        if hora_local < 8 and chuva_atual == 0.0:
            inversao_delta_c = round(aleatorio.uniform(0.5, 4.0), 1)
        else:
            inversao_delta_c = round(aleatorio.uniform(-8.0, -4.0), 1)

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
            inversao_termica=inversao_delta_c > 0,
            inversao_delta_c=inversao_delta_c,
        )

    async def ler_varias(
        self, pontos: list[tuple[str, float, float]]
    ) -> dict[str, LeituraAmbiente]:
        leituras: dict[str, LeituraAmbiente] = {}
        for geohash5, latitude, longitude in pontos:
            leituras[geohash5] = await self.ler(geohash5, latitude, longitude)
        return leituras
