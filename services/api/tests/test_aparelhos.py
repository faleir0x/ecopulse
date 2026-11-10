from typing import Any
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from ecopulse_api import aparelhos, limite, main
from ecopulse_api.schemas import AparelhoIn
from ecopulse_common.events import Severidade, TipoRisco


@pytest.fixture
def chamadas(
    monkeypatch: pytest.MonkeyPatch, limitador_falso: Any
) -> tuple[list[tuple[UUID, AparelhoIn]], list[UUID]]:
    registros: list[tuple[UUID, AparelhoIn]] = []
    remocoes: list[UUID] = []

    async def fake_registrar(_pool: Any, aparelho_id: UUID, dados: AparelhoIn) -> None:
        registros.append((aparelho_id, dados))

    async def fake_remover(_pool: Any, aparelho_id: UUID) -> None:
        remocoes.append(aparelho_id)

    monkeypatch.setattr(aparelhos, "registrar", fake_registrar)
    monkeypatch.setattr(aparelhos, "remover", fake_remover)
    main.app.state.pool = MagicMock()
    return registros, remocoes


def _dados(**alteracoes: Any) -> dict[str, Any]:
    dados: dict[str, Any] = {
        "token": "token-fcm-de-teste-1234567890",
        "latitude": -23.5505,
        "longitude": -46.6333,
        "raio_m": 1_000,
        "limiar": "alto",
        "tipos": ["alagamento", "calor"],
        "silenciado_ate": None,
    }
    dados.update(alteracoes)
    return dados


def test_put_registra_e_responde_204(
    chamadas: tuple[list[tuple[UUID, AparelhoIn]], list[UUID]],
) -> None:
    registros, remocoes = chamadas
    aparelho_id = uuid4()

    resposta = TestClient(main.app).put(f"/v1/aparelhos/{aparelho_id}", json=_dados())

    assert resposta.status_code == 204
    assert resposta.content == b""
    assert remocoes == []
    [(registrado_id, dados)] = registros
    assert registrado_id == aparelho_id
    assert dados.limiar is Severidade.ALTO
    assert dados.tipos == [TipoRisco.ALAGAMENTO, TipoRisco.CALOR]


def test_delete_remove_e_responde_204(
    chamadas: tuple[list[tuple[UUID, AparelhoIn]], list[UUID]],
) -> None:
    registros, remocoes = chamadas
    aparelho_id = uuid4()

    resposta = TestClient(main.app).delete(f"/v1/aparelhos/{aparelho_id}")

    assert resposta.status_code == 204
    assert resposta.content == b""
    assert registros == []
    assert remocoes == [aparelho_id]


@pytest.mark.parametrize(
    "alteracao",
    [
        {"token": "curto"},
        {"raio_m": 99},
        {"raio_m": 10_001},
        {"latitude": 91},
        {"latitude": -91},
        {"tipos": ["terremoto"]},
    ],
)
def test_validacao_responde_422(
    chamadas: tuple[list[tuple[UUID, AparelhoIn]], list[UUID]], alteracao: dict[str, Any]
) -> None:
    registros, _ = chamadas

    resposta = TestClient(main.app).put(f"/v1/aparelhos/{uuid4()}", json=_dados(**alteracao))

    assert resposta.status_code == 422
    assert registros == []


def test_limite_negado_responde_429(
    chamadas: tuple[list[tuple[UUID, AparelhoIn]], list[UUID]], limitador_falso: Any
) -> None:
    registros, _ = chamadas
    limitador_falso.negar("aparelho", 7)

    resposta = TestClient(main.app).put(f"/v1/aparelhos/{uuid4()}", json=_dados())

    assert resposta.status_code == 429
    assert resposta.headers["retry-after"] == "7"
    assert registros == []


def test_chave_aparelho_usa_hash_tag() -> None:
    assert limite.chave_aparelho("203.0.113.10") == "rl:aparelho:{203.0.113.10}"
