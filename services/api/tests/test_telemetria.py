from typing import Any
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from redis.exceptions import ConnectionError as RedisConnectionError

from ecopulse_api import main
from ecopulse_common import geohash, messaging
from ecopulse_common.events import Envelope, EventType, TelemetriaAparelho

LAT = -23.5505
LON = -46.6333
CELULA = geohash.encode(LAT, LON, geohash.CELL_PRECISION)


class RedisLiberado:
    """Dublê do Redis Cluster: o token bucket sempre libera."""

    async def eval(self, *_: Any) -> list[Any]:
        return [1, "0"]


class RedisEsgotado:
    """Dublê do Redis Cluster: o token bucket sempre nega o pedido."""

    async def eval(self, *_: Any) -> list[Any]:
        return [0, "60"]


class RedisFora:
    async def eval(self, *_: Any) -> list[Any]:
        raise RedisConnectionError("caiu")


@pytest.fixture
def publicados(monkeypatch: pytest.MonkeyPatch) -> list[Envelope]:
    enviados: list[Envelope] = []

    async def fake_publish(exchange: Any, envelope: Envelope, **_: Any) -> None:
        enviados.append(envelope)

    monkeypatch.setattr(messaging, "publish", fake_publish)
    main.app.state.broker = MagicMock()
    main.app.state.redis = RedisLiberado()
    return enviados


def _telemetria(**extra: Any) -> dict[str, Any]:
    return {
        "device_id": str(uuid4()),
        "latitude": LAT,
        "longitude": LON,
        "precisao_m": 12.5,
        "registrado_em": "2026-11-10T12:00:00Z",
        **extra,
    }


def test_aceita_e_publica_celula(publicados: list[Envelope]) -> None:
    corpo = _telemetria()
    resposta = TestClient(main.app).post("/v1/telemetria", json=corpo)

    assert resposta.status_code == 202
    assert resposta.json() == {"aceito": True}
    [envelope] = publicados
    assert envelope.type is EventType.TELEMETRIA_APARELHO
    assert envelope.geohash == CELULA
    assert len(envelope.payload["geohash"]) == 6
    assert envelope.payload["geohash"] == CELULA
    assert envelope.payload["device_id"] == corpo["device_id"]
    assert "latitude" not in envelope.payload
    assert "longitude" not in envelope.payload


def test_limite_estourado_responde_429(monkeypatch: pytest.MonkeyPatch) -> None:
    publicados: list[Envelope] = []

    async def fake_publish(exchange: Any, envelope: Envelope, **_: Any) -> None:
        publicados.append(envelope)

    monkeypatch.setattr(messaging, "publish", fake_publish)
    main.app.state.broker = MagicMock()
    main.app.state.redis = RedisEsgotado()

    resposta = TestClient(main.app).post("/v1/telemetria", json=_telemetria())

    assert resposta.status_code == 429
    assert resposta.json()["detail"] == "muita telemetria deste IP"
    assert resposta.headers["retry-after"] == "60"
    assert publicados == []


def test_presenca_soma_celula_e_vizinhas(monkeypatch: pytest.MonkeyPatch) -> None:
    chamadas: list[list[str]] = []

    async def fake_contar(redis: Any, celulas: list[str], agora_s: float) -> int:
        chamadas.append(celulas)
        return len(celulas)

    monkeypatch.setattr(main, "contar_presenca", fake_contar)
    main.app.state.redis = RedisLiberado()

    resposta = TestClient(main.app).get("/v1/presenca", params={"lat": LAT, "lon": LON})

    assert resposta.status_code == 200
    assert resposta.json() == {"aparelhos": 9, "janela_min": 15}
    [celulas] = chamadas
    assert celulas[0] == CELULA
    assert set(celulas) == {CELULA, *geohash.neighbors(CELULA)}


def test_presenca_com_redis_fora_responde_503(monkeypatch: pytest.MonkeyPatch) -> None:
    async def falha(redis: Any, celulas: list[str], agora_s: float) -> int:
        raise RedisConnectionError("caiu")

    monkeypatch.setattr(main, "contar_presenca", falha)
    main.app.state.redis = RedisLiberado()

    resposta = TestClient(main.app).get("/v1/presenca", params={"lat": LAT, "lon": LON})

    assert resposta.status_code == 503
    assert resposta.json()["detail"] == "presença indisponível"


def test_publica_telemetria_sem_coordenada(publicados: list[Envelope]) -> None:
    TestClient(main.app).post("/v1/telemetria", json=_telemetria())

    [envelope] = publicados
    validado = TelemetriaAparelho.model_validate(envelope.payload)
    assert validado.device_id
    assert validado.geohash == CELULA
