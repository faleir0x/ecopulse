from datetime import UTC, datetime, timedelta
from typing import Any
from unittest.mock import MagicMock
from uuid import UUID, uuid4

import pytest

from ecopulse_common import messaging
from ecopulse_common.consumer import Handler
from ecopulse_common.events import Envelope, EventType, TelemetriaAparelho
from ecopulse_common.telemetria import JANELA_PRESENCA_S
from ecopulse_processor import telemetria

CELULA = "6gyf4b"


def _envelope(device_id: UUID, registrado_em: datetime) -> Envelope:
    payload = TelemetriaAparelho(
        device_id=device_id,
        geohash=CELULA,
        registrado_em=registrado_em,
    )
    return Envelope(
        type=EventType.TELEMETRIA_APARELHO,
        geohash=CELULA,
        payload=payload.model_dump(mode="json"),
    )


async def _capturar_handler(
    monkeypatch: pytest.MonkeyPatch,
    chamadas: list[tuple[str, str, float]],
) -> Handler:
    handlers: list[Handler] = []

    async def fake_assinar(
        channel: Any,
        exchange: Any,
        fila: str,
        bindings: Any,
        handler: Handler,
        *,
        dlx: Any,
        tentativas: int = 3,
    ) -> None:
        handlers.append(handler)

    async def fake_topologia(channel: Any, partitions: int) -> Any:
        return MagicMock(dlx=MagicMock())

    async def fake_registrar(redis: Any, geohash6: str, device_id: str, agora_s: float) -> None:
        chamadas.append((geohash6, device_id, agora_s))

    monkeypatch.setattr(telemetria, "assinar", fake_assinar)
    monkeypatch.setattr(messaging, "declare_topology", fake_topologia)
    monkeypatch.setattr(telemetria, "registrar_presenca", fake_registrar)

    await telemetria.iniciar(MagicMock(), MagicMock(), MagicMock())
    return handlers[0]


async def test_handler_registra_presenca_na_celula(monkeypatch: pytest.MonkeyPatch) -> None:
    chamadas: list[tuple[str, str, float]] = []
    handler = await _capturar_handler(monkeypatch, chamadas)
    device_id = uuid4()
    registrado_em = datetime.now(UTC)

    await handler(_envelope(device_id, registrado_em))

    [chamada] = chamadas
    assert chamada[0] == CELULA
    assert chamada[1] == str(device_id)
    assert chamada[2] == pytest.approx(registrado_em.timestamp())


async def test_handler_descarta_sinal_velho(monkeypatch: pytest.MonkeyPatch) -> None:
    chamadas: list[tuple[str, str, float]] = []
    handler = await _capturar_handler(monkeypatch, chamadas)
    velho = datetime.now(UTC) - timedelta(seconds=JANELA_PRESENCA_S + 60)

    await handler(_envelope(uuid4(), velho))

    assert chamadas == []


async def test_handler_usa_horario_do_servidor_para_sinal_futuro(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    chamadas: list[tuple[str, str, float]] = []
    handler = await _capturar_handler(monkeypatch, chamadas)
    futuro = datetime.now(UTC) + timedelta(minutes=10)
    antes = datetime.now(UTC).timestamp()

    await handler(_envelope(uuid4(), futuro))

    [chamada] = chamadas
    assert chamada[2] >= antes
