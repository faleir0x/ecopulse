import asyncio
from typing import Any, cast
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from redis.asyncio.cluster import RedisCluster

from ecopulse_api import limite, portas
from ecopulse_common import messaging
from ecopulse_common.events import Envelope, EventType
from ecopulse_common.messaging import Topology


async def test_publicador_rabbit_publica_no_exchange_de_eventos(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    chamadas: list[tuple[Any, Envelope]] = []

    async def fake_publish(exchange: Any, envelope: Envelope, **_: Any) -> None:
        chamadas.append((exchange, envelope))

    monkeypatch.setattr(messaging, "publish", fake_publish)
    topology = cast(Topology, MagicMock())
    envelope = Envelope(type=EventType.TELEMETRIA_APARELHO, geohash="6gyf4b", payload={})

    await portas.PublicadorRabbit(topology).publicar(envelope)

    assert chamadas == [(topology.events, envelope)]


async def test_publicador_rabbit_aplica_prazo(monkeypatch: pytest.MonkeyPatch) -> None:
    async def demora(*_: Any, **__: Any) -> None:
        await asyncio.sleep(0.05)

    monkeypatch.setattr(messaging, "publish", demora)
    monkeypatch.setattr(portas, "TIMEOUT_PUBLICACAO_S", 0.001)
    topology = cast(Topology, MagicMock())
    envelope = Envelope(type=EventType.TELEMETRIA_APARELHO, geohash="6gyf4b", payload={})

    with pytest.raises(TimeoutError):
        await portas.PublicadorRabbit(topology).publicar(envelope)


async def test_limitador_redis_mapeia_cada_balde(monkeypatch: pytest.MonkeyPatch) -> None:
    resultado = limite.Resultado(permitido=True, retry_after_s=0)
    nomes = (
        "consumir",
        "consumir_ip",
        "consumir_voto",
        "consumir_ambiente",
        "consumir_rota",
        "consumir_local",
        "consumir_aparelho",
        "consumir_telemetria",
    )
    mocks = {nome: AsyncMock(return_value=resultado) for nome in nomes}
    for nome, mock in mocks.items():
        monkeypatch.setattr(limite, nome, mock)

    redis = cast(RedisCluster, object())
    limitador = portas.LimitadorRedis(redis)
    device_id = uuid4()
    ip = "203.0.113.9"

    casos = [
        ("relato", str(device_id), "consumir", device_id),
        ("ip", ip, "consumir_ip", ip),
        ("voto", ip, "consumir_voto", ip),
        ("ambiente", ip, "consumir_ambiente", ip),
        ("rota", ip, "consumir_rota", ip),
        ("local", ip, "consumir_local", ip),
        ("aparelho", ip, "consumir_aparelho", ip),
        ("telemetria", ip, "consumir_telemetria", ip),
    ]
    for balde, chave, funcao, esperado in casos:
        assert await limitador.consumir(balde, chave) == resultado
        mocks[funcao].assert_awaited_once_with(redis, esperado)

    with pytest.raises(ValueError, match="balde desconhecido"):
        await limitador.consumir("desconhecido", ip)
