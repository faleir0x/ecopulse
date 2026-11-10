from datetime import UTC, datetime
from typing import Any, cast

import pytest
from aio_pika import Message
from aio_pika.abc import AbstractExchange
from redis.asyncio.cluster import RedisCluster

from ecopulse_common import ambiente
from ecopulse_common.events import Envelope, EventType, LeituraAmbiente
from ecopulse_environment import coletor
from ecopulse_environment.fontes import Simulador

AGORA = 1_800_000_000.0
INTERVALO = 600
CELULAS = ["6gycf", "6gyce", "6gycg"]


class ExchangeFalso:
    def __init__(self) -> None:
        self.mensagens: list[tuple[Message, str]] = []

    async def publish(self, message: Message, routing_key: str, **_: Any) -> None:
        self.mensagens.append((message, routing_key))


class FonteFalsa:
    nome = "falsa"

    def __init__(self, sem_leitura: set[str] | None = None) -> None:
        self.sem_leitura = sem_leitura or set()
        self._simulador = Simulador(semente=1, agora=datetime(2026, 11, 8, 12, tzinfo=UTC))

    async def ler(self, geohash5: str, latitude: float, longitude: float) -> LeituraAmbiente:
        return await self._simulador.ler(geohash5, latitude, longitude)

    async def ler_varias(
        self, pontos: list[tuple[str, float, float]]
    ) -> dict[str, LeituraAmbiente]:
        leituras: dict[str, LeituraAmbiente] = {}
        for geohash5, latitude, longitude in pontos:
            if geohash5 in self.sem_leitura:
                continue
            leituras[geohash5] = await self.ler(geohash5, latitude, longitude)
        return leituras


def _fakes(monkeypatch: pytest.MonkeyPatch, marcadas: dict[str, float]) -> None:
    async def celulas_ativas(redis: object, agora_s: float) -> list[str]:
        return CELULAS

    async def coletadas_em(redis: object, celulas: list[str]) -> dict[str, float]:
        return {}

    async def marcar_coletada(redis: object, geohash5: str, agora_s: float) -> None:
        marcadas[geohash5] = agora_s

    monkeypatch.setattr(ambiente, "celulas_ativas", celulas_ativas)
    monkeypatch.setattr(ambiente, "coletadas_em", coletadas_em)
    monkeypatch.setattr(ambiente, "marcar_coletada", marcar_coletada)


async def test_coletar_vencidas_publica_todas_as_leituras(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    marcadas: dict[str, float] = {}
    _fakes(monkeypatch, marcadas)
    exchange = ExchangeFalso()

    publicadas = await coletor.coletar_vencidas(
        cast(RedisCluster, object()),
        FonteFalsa(),
        cast(AbstractExchange, exchange),
        INTERVALO,
        AGORA,
    )

    assert publicadas == len(CELULAS)
    assert set(marcadas) == set(CELULAS)
    assert all(quando == AGORA for quando in marcadas.values())
    assert len(exchange.mensagens) == len(CELULAS)

    envelopes = [Envelope.model_validate_json(mensagem.body) for mensagem, _ in exchange.mensagens]
    assert {envelope.geohash[:5] for envelope in envelopes} == set(CELULAS)
    assert all(envelope.type == EventType.LEITURA_AMBIENTE for envelope in envelopes)


async def test_coletar_vencidas_ignora_celula_sem_leitura(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    marcadas: dict[str, float] = {}
    _fakes(monkeypatch, marcadas)
    exchange = ExchangeFalso()

    publicadas = await coletor.coletar_vencidas(
        cast(RedisCluster, object()),
        FonteFalsa(sem_leitura={CELULAS[1]}),
        cast(AbstractExchange, exchange),
        INTERVALO,
        AGORA,
    )

    assert publicadas == 2
    assert set(marcadas) == {CELULAS[0], CELULAS[2]}
    assert len(exchange.mensagens) == 2
