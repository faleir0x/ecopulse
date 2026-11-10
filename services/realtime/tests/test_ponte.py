from collections.abc import Awaitable, Callable, Sequence
from datetime import UTC, datetime, timedelta
from typing import Any, cast

import pytest
from aio_pika.abc import AbstractChannel, AbstractExchange
from redis.asyncio.cluster import RedisCluster

from ecopulse_common import geohash, messaging, ordem
from ecopulse_common.events import (
    Envelope,
    EventType,
    OcorrenciaPayload,
    Severidade,
    StatusOcorrencia,
    TipoRisco,
)
from ecopulse_realtime import ponte

LATITUDE = 38.72
LONGITUDE = -9.14
OCORRENCIA_ID = 42


class RedisFalso:
    def __init__(self) -> None:
        self.publicados: list[tuple[str, str]] = []

    async def spublish(self, canal: str, mensagem: str) -> int:
        self.publicados.append((canal, mensagem))
        return 1


def _envelope(versao: int) -> Envelope:
    agora = datetime.now(UTC)
    payload = OcorrenciaPayload(
        id=OCORRENCIA_ID,
        tipo=TipoRisco.ALAGAMENTO,
        severidade=Severidade.ALTO,
        latitude=LATITUDE,
        longitude=LONGITUDE,
        geohash=geohash.encode(LATITUDE, LONGITUDE, geohash.CELL_PRECISION),
        confirmacoes=1,
        status=StatusOcorrencia.ATIVA,
        criada_em=agora,
        atualizada_em=agora,
        expira_em=agora + timedelta(hours=1),
        versao=versao,
    )
    return Envelope(
        type=EventType.OCORRENCIA_ATUALIZADA,
        geohash=payload.geohash,
        payload=payload.model_dump(mode="json"),
    )


async def _handler(
    monkeypatch: pytest.MonkeyPatch, redis: RedisFalso
) -> Callable[[Envelope], Awaitable[None]]:
    capturado: dict[str, Callable[[Envelope], Awaitable[None]]] = {}

    class TopologiaFalsa:
        dlx = cast(AbstractExchange, object())

    async def fake_topologia(_canal: Any, _particoes: int) -> TopologiaFalsa:
        return TopologiaFalsa()

    async def fake_assinar(
        _canal: Any,
        _exchange: Any,
        _fila: str,
        _bindings: Sequence[str],
        handler: Callable[[Envelope], Awaitable[None]],
        *,
        dlx: Any,
    ) -> None:
        del dlx
        capturado["handler"] = handler

    monkeypatch.setattr(messaging, "declare_topology", fake_topologia)
    monkeypatch.setattr(ponte, "assinar", fake_assinar)

    await ponte.iniciar(
        cast(AbstractChannel, object()),
        cast(AbstractExchange, object()),
        cast(RedisCluster, redis),
    )
    return capturado["handler"]


async def test_evento_com_versao_antiga_nao_publica(monkeypatch: pytest.MonkeyPatch) -> None:
    redis = RedisFalso()
    chamadas: list[tuple[str, int, int]] = []

    async def fake_versao_atual(
        _redis: Any, consumidor: str, ocorrencia_id: int, versao: int
    ) -> bool:
        chamadas.append((consumidor, ocorrencia_id, versao))
        return versao >= 2

    monkeypatch.setattr(ordem, "versao_atual", fake_versao_atual)
    handler = await _handler(monkeypatch, redis)

    await handler(_envelope(1))
    assert redis.publicados == []

    await handler(_envelope(2))
    assert len(redis.publicados) == 1
    assert chamadas == [
        ("realtime", OCORRENCIA_ID, 1),
        ("realtime", OCORRENCIA_ID, 2),
    ]
