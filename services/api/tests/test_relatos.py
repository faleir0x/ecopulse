from typing import Any
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from aio_pika.exceptions import AMQPConnectionError
from fastapi.testclient import TestClient

from ecopulse_api import main
from ecopulse_common import messaging
from ecopulse_common.events import Envelope, EventType


class RedisLiberado:
    """Dublê do Redis Cluster: o token bucket sempre libera."""

    async def eval(self, *_: Any) -> list[Any]:
        return [1, "0"]


@pytest.fixture
def publicados(monkeypatch: pytest.MonkeyPatch) -> list[Envelope]:
    enviados: list[Envelope] = []

    async def fake_publish(exchange: Any, envelope: Envelope, **_: Any) -> None:
        enviados.append(envelope)

    monkeypatch.setattr(messaging, "publish", fake_publish)
    main.app.state.broker = MagicMock()
    main.app.state.redis = RedisLiberado()
    return enviados


def _relato(**extra: Any) -> dict[str, Any]:
    return {
        "client_id": str(uuid4()),
        "device_id": str(uuid4()),
        "tipo": "alagamento",
        "severidade": "alto",
        "latitude": -23.5505,
        "longitude": -46.6333,
        "registrado_em": "2026-11-07T12:00:00Z",
        **extra,
    }


def test_aceita_e_publica(publicados: list[Envelope]) -> None:
    corpo = _relato()
    resposta = TestClient(main.app).post("/v1/relatos", json=corpo)

    assert resposta.status_code == 202
    assert resposta.json() == {"status": "aceito", "client_id": corpo["client_id"]}
    [envelope] = publicados
    assert envelope.type is EventType.RELATO_RECEBIDO
    assert str(envelope.event_id) == corpo["client_id"]
    assert envelope.geohash == "6gyf4b"
    assert envelope.payload["tipo"] == "alagamento"


def test_reenvio_gera_mesmo_event_id(publicados: list[Envelope]) -> None:
    corpo = _relato()
    cliente = TestClient(main.app)
    cliente.post("/v1/relatos", json=corpo)
    cliente.post("/v1/relatos", json=corpo)

    assert publicados[0].event_id == publicados[1].event_id


@pytest.mark.parametrize(
    "invalido",
    [{"latitude": 91}, {"tipo": "terremoto"}, {"severidade": "extrema"}, {"descricao": "x" * 501}],
)
def test_rejeita_payload_invalido(publicados: list[Envelope], invalido: dict[str, Any]) -> None:
    resposta = TestClient(main.app).post("/v1/relatos", json=_relato(**invalido))

    assert resposta.status_code == 422
    assert publicados == []


def test_broker_fora_responde_503(monkeypatch: pytest.MonkeyPatch) -> None:
    async def falha(*_: Any, **__: Any) -> None:
        raise AMQPConnectionError("caiu")

    monkeypatch.setattr(messaging, "publish", falha)
    main.app.state.broker = MagicMock()
    main.app.state.redis = RedisLiberado()
    resposta = TestClient(main.app).post("/v1/relatos", json=_relato())

    assert resposta.status_code == 503
    assert resposta.headers["retry-after"] == "5"


def test_publicacao_sem_prazo_responde_503(monkeypatch: pytest.MonkeyPatch) -> None:
    async def demora(*_: Any, **__: Any) -> None:
        raise TimeoutError

    monkeypatch.setattr(messaging, "publish", demora)
    main.app.state.broker = MagicMock()
    main.app.state.redis = RedisLiberado()
    resposta = TestClient(main.app).post("/v1/relatos", json=_relato())

    assert resposta.status_code == 503
    assert resposta.json()["detail"] == "fila indisponível; tente de novo"


def test_rejeita_data_sem_fuso(publicados: list[Envelope]) -> None:
    resposta = TestClient(main.app).post(
        "/v1/relatos", json=_relato(registrado_em="2026-11-07T12:00:00")
    )

    assert resposta.status_code == 422
    assert publicados == []
