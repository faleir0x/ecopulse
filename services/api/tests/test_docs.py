import importlib
import os

import pytest
from fastapi.testclient import TestClient

from ecopulse_api import main


def test_docs_desativados_em_producao(monkeypatch: pytest.MonkeyPatch) -> None:
    anterior = os.environ.get("ECOPULSE_API_DOCS")
    monkeypatch.setenv("ECOPULSE_API_DOCS", "false")
    importlib.reload(main)
    try:
        cliente = TestClient(main.app)
        assert cliente.get("/docs").status_code == 404
        assert cliente.get("/redoc").status_code == 404
        assert cliente.get("/openapi.json").status_code == 404
    finally:
        if anterior is None:
            monkeypatch.delenv("ECOPULSE_API_DOCS", raising=False)
        else:
            monkeypatch.setenv("ECOPULSE_API_DOCS", anterior)
        importlib.reload(main)
