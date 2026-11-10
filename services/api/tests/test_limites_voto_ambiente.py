from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from ecopulse_api import leitura, main
from ecopulse_common import geohash
from ecopulse_common.events import (
    OcorrenciaPayload,
    Severidade,
    StatusOcorrencia,
    TipoRisco,
)

LATITUDE = -23.5505
LONGITUDE = -46.6333


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
def test_voto_alem_do_balde_responde_429(
    monkeypatch: pytest.MonkeyPatch,
    caminho: str,
    publicador_falso: Any,
    limitador_falso: Any,
) -> None:
    async def fake_buscar(_: Any, __: int) -> OcorrenciaPayload:
        return _ocorrencia()

    monkeypatch.setattr(leitura, "buscar_ocorrencia", fake_buscar)
    limitador_falso.negar("voto", 30)
    main.app.state.pool = MagicMock()

    resposta = TestClient(main.app).post(caminho, json=_voto())

    assert resposta.status_code == 429
    assert resposta.headers["retry-after"] == "30"
    assert resposta.json() == {"detail": "muitos votos deste IP"}
    assert publicador_falso.envelopes == []
    assert ("voto", "testclient") in limitador_falso.chamadas


def test_camada_alem_do_balde_de_ambiente_responde_429(limitador_falso: Any) -> None:
    limitador_falso.negar("ambiente", 2)

    resposta = TestClient(main.app).get(
        "/v1/ambiente/camada", params={"bbox": "-46.7,-23.6,-46.5,-23.5"}
    )

    assert resposta.status_code == 429
    assert resposta.headers["retry-after"] == "2"
    assert resposta.json() == {"detail": "muitas consultas de ambiente deste IP"}
    assert limitador_falso.chamadas == [("ambiente", "testclient")]
