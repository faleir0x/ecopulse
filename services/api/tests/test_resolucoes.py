from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from ecopulse_api import leitura, main
from ecopulse_common import geohash, messaging
from ecopulse_common.events import (
    Envelope,
    EventType,
    OcorrenciaPayload,
    ResolucaoRecebida,
    Severidade,
    StatusOcorrencia,
    TipoRisco,
)

LATITUDE = -23.5505
LONGITUDE = -46.6333


class RedisLiberado:
    async def eval(self, *_: Any) -> list[Any]:
        return [1, "0"]


@pytest.fixture
def publicados(monkeypatch: pytest.MonkeyPatch) -> list[Envelope]:
    enviados: list[Envelope] = []

    async def fake_publish(exchange: Any, envelope: Envelope, **_: Any) -> None:
        enviados.append(envelope)

    monkeypatch.setattr(messaging, "publish", fake_publish)
    main.app.state.broker = MagicMock()
    main.app.state.pool = MagicMock()
    main.app.state.redis = RedisLiberado()
    return enviados


def _ocorrencia(status: StatusOcorrencia = StatusOcorrencia.ATIVA) -> OcorrenciaPayload:
    agora = datetime(2026, 11, 7, 12, tzinfo=UTC)
    return OcorrenciaPayload(
        id=1,
        tipo=TipoRisco.ALAGAMENTO,
        severidade=Severidade.ALTO,
        latitude=LATITUDE,
        longitude=LONGITUDE,
        geohash=geohash.encode(LATITUDE, LONGITUDE, geohash.CELL_PRECISION),
        confirmacoes=3,
        status=status,
        criada_em=agora,
        atualizada_em=agora,
        expira_em=agora + timedelta(hours=1),
    )


def _resolucao() -> dict[str, str]:
    return {
        "client_id": str(uuid4()),
        "device_id": str(uuid4()),
        "registrado_em": "2026-11-07T12:00:00Z",
    }


def _buscar_retornando(
    monkeypatch: pytest.MonkeyPatch, ocorrencia: OcorrenciaPayload | None
) -> None:
    async def fake_buscar(_: Any, __: int) -> OcorrenciaPayload | None:
        return ocorrencia

    monkeypatch.setattr(leitura, "buscar_ocorrencia", fake_buscar)


def test_resolucao_aceita_publica_envelope(
    publicados: list[Envelope], monkeypatch: pytest.MonkeyPatch
) -> None:
    ocorrencia = _ocorrencia()
    _buscar_retornando(monkeypatch, ocorrencia)
    corpo = _resolucao()

    resposta = TestClient(main.app).post("/v1/ocorrencias/1/resolucoes", json=corpo)

    assert resposta.status_code == 202
    assert resposta.json() == {"status": "aceito", "client_id": corpo["client_id"]}
    [envelope] = publicados
    assert envelope.type is EventType.RESOLUCAO_RECEBIDA
    assert str(envelope.event_id) == corpo["client_id"]
    assert envelope.geohash == geohash.encode(LATITUDE, LONGITUDE, geohash.CELL_PRECISION)
    payload = ResolucaoRecebida.model_validate(envelope.payload)
    assert payload.client_id == UUID(corpo["client_id"])
    assert payload.device_id == UUID(corpo["device_id"])
    assert payload.ocorrencia_id == 1


def test_resolucao_inexistente_responde_404(
    publicados: list[Envelope], monkeypatch: pytest.MonkeyPatch
) -> None:
    _buscar_retornando(monkeypatch, None)

    resposta = TestClient(main.app).post("/v1/ocorrencias/1/resolucoes", json=_resolucao())

    assert resposta.status_code == 404
    assert publicados == []


def test_resolucao_em_ocorrencia_encerrada_responde_409(
    publicados: list[Envelope], monkeypatch: pytest.MonkeyPatch
) -> None:
    _buscar_retornando(monkeypatch, _ocorrencia(StatusOcorrencia.EXPIRADA))

    resposta = TestClient(main.app).post("/v1/ocorrencias/1/resolucoes", json=_resolucao())

    assert resposta.status_code == 409
    assert resposta.json() == {"detail": "ocorrência encerrada"}
    assert publicados == []
