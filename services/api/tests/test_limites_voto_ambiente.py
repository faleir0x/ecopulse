from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from ecopulse_api import leitura, main
from ecopulse_common import geohash, messaging
from ecopulse_common.events import (
    OcorrenciaPayload,
    Severidade,
    StatusOcorrencia,
    TipoRisco,
)

LATITUDE = -23.5505
LONGITUDE = -46.6333


class RedisSoVotoEsgotado:
    """O balde do aparelho e o do IP liberam; o de votos nega (mede também a chave usada)."""

    def __init__(self) -> None:
        self.chaves: list[str] = []

    async def eval(self, _script: Any, _numkeys: Any, chave: str, *_: Any) -> list[Any]:
        self.chaves.append(chave)
        if chave.startswith("rl:voto:"):
            return [0, "29.2"]
        return [1, "0"]


class RedisSoAmbienteEsgotado:
    def __init__(self) -> None:
        self.chaves: list[str] = []

    async def eval(self, _script: Any, _numkeys: Any, chave: str, *_: Any) -> list[Any]:
        self.chaves.append(chave)
        if chave.startswith("rl:ambiente:"):
            return [0, "1.2"]
        return [1, "0"]


def _ocorrencia() -> OcorrenciaPayload:
    agora = datetime(2026, 11, 7, 12, tzinfo=UTC)
    return OcorrenciaPayload(
        id=1,
        tipo=TipoRisco.ALAGAMENTO,
        severidade=Severidade.ALTO,
        latitude=LATITUDE,
        longitude=LONGITUDE,
        geohash=geohash.encode(LATITUDE, LONGITUDE, geohash.CELL_PRECISION),
        confirmacoes=3,
        status=StatusOcorrencia.ATIVA,
        criada_em=agora,
        atualizada_em=agora,
        expira_em=agora + timedelta(hours=1),
    )


def _voto() -> dict[str, str]:
    return {
        "client_id": str(uuid4()),
        "device_id": str(uuid4()),
        "registrado_em": "2026-11-07T12:00:00Z",
    }


@pytest.mark.parametrize(
    "caminho",
    ["/v1/ocorrencias/1/confirmacoes", "/v1/ocorrencias/1/resolucoes"],
)
def test_voto_alem_do_balde_responde_429(monkeypatch: pytest.MonkeyPatch, caminho: str) -> None:
    publicados: list[Any] = []

    async def fake_buscar(_: Any, __: int) -> OcorrenciaPayload:
        return _ocorrencia()

    async def fake_publish(*args: Any, **_: Any) -> None:
        publicados.append(args)

    monkeypatch.setattr(leitura, "buscar_ocorrencia", fake_buscar)
    monkeypatch.setattr(messaging, "publish", fake_publish)
    redis = RedisSoVotoEsgotado()
    main.app.state.broker = MagicMock()
    main.app.state.pool = MagicMock()
    main.app.state.redis = redis
    main.app.state.proxies = frozenset()

    resposta = TestClient(main.app).post(caminho, json=_voto())

    assert resposta.status_code == 429
    assert resposta.headers["retry-after"] == "30"
    assert resposta.json() == {"detail": "muitos votos deste IP"}
    assert publicados == []
    assert "rl:voto:{testclient}" in redis.chaves


def test_camada_alem_do_balde_de_ambiente_responde_429() -> None:
    redis = RedisSoAmbienteEsgotado()
    main.app.state.redis = redis
    main.app.state.proxies = frozenset()

    resposta = TestClient(main.app).get(
        "/v1/ambiente/camada", params={"bbox": "-46.7,-23.6,-46.5,-23.5"}
    )

    assert resposta.status_code == 429
    assert resposta.headers["retry-after"] == "2"
    assert resposta.json() == {"detail": "muitas consultas de ambiente deste IP"}
    assert redis.chaves == ["rl:ambiente:{testclient}"]
