from datetime import UTC, datetime
from typing import Any
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from ecopulse_api import leitura, limite, main
from ecopulse_api.schemas import CelulaAmbiente


def test_camada_informa_celulas_pendentes(monkeypatch: pytest.MonkeyPatch) -> None:
    def celulas(*_: Any, **__: Any) -> list[str]:
        return ["eycs2", "eycs3"]

    async def leituras(*_: Any, **__: Any) -> list[CelulaAmbiente]:
        return [
            CelulaAmbiente(
                geohash="eycs2",
                lat_min=0.0,
                lon_min=0.0,
                lat_max=1.0,
                lon_max=1.0,
                temperatura=24.0,
                aqi=35,
                medido_em=datetime.now(UTC),
            )
        ]

    async def interesse(*_: Any, **__: Any) -> bool:
        return True

    async def limite_liberado(*_: Any, **__: Any) -> limite.Resultado:
        return limite.Resultado(permitido=True, retry_after_s=0)

    monkeypatch.setattr(leitura, "celulas_amostradas_do_bbox", celulas)
    monkeypatch.setattr(leitura, "leituras_das_celulas", leituras)
    monkeypatch.setattr("ecopulse_api.main.registrar_interesse", interesse)
    monkeypatch.setattr(limite, "consumir_ambiente", limite_liberado)
    main.app.state.pool = MagicMock()
    main.app.state.redis = MagicMock()

    resposta = TestClient(main.app).get(
        "/v1/ambiente/camada", params={"bbox": "-9.15,38.70,-9.12,38.74"}
    )

    assert resposta.status_code == 200
    assert resposta.headers["x-celulas-pendentes"] == "1"
    assert [item["geohash"] for item in resposta.json()] == ["eycs2"]
