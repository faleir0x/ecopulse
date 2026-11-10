from datetime import UTC, datetime
from typing import Any, cast

import pytest
from aio_pika import Message
from aio_pika.abc import AbstractExchange
from redis.asyncio.cluster import RedisCluster

from ecopulse_common import ambiente
from ecopulse_common.events import Envelope, EventType, LeituraAmbiente
from ecopulse_environment import coletor
from ecopulse_environment.fontes import FonteIndisponivel, Simulador

AGORA = 1_800_000_000.0
INTERVALO = 600

pytestmark = pytest.mark.integration


class ExchangeFalso:
    def __init__(self) -> None:
        self.mensagens: list[tuple[Message, str]] = []

    async def publish(self, message: Message, routing_key: str, **_: Any) -> None:
        self.mensagens.append((message, routing_key))


class ExchangeQueFalha:
    async def publish(self, message: Message, routing_key: str, **_: Any) -> None:
        raise RuntimeError("broker indisponível")


class FonteFalsa:
    nome = "falsa"

    def __init__(self, falhar_em: set[str] | None = None) -> None:
        self.falhar_em = falhar_em or set()
        self.chamadas: list[str] = []
        self._simulador = Simulador(semente=1, agora=datetime(2026, 11, 8, 12, tzinfo=UTC))

    async def ler(self, geohash5: str, latitude: float, longitude: float) -> LeituraAmbiente:
        self.chamadas.append(geohash5)
        if geohash5 in self.falhar_em:
            raise FonteIndisponivel(geohash5)
        return await self._simulador.ler(geohash5, latitude, longitude)

    async def ler_varias(
        self, pontos: list[tuple[str, float, float]]
    ) -> dict[str, LeituraAmbiente]:
        leituras: dict[str, LeituraAmbiente] = {}
        for geohash5, latitude, longitude in pontos:
            try:
                leituras[geohash5] = await self.ler(geohash5, latitude, longitude)
            except FonteIndisponivel:
                continue
        return leituras


def _envelopes(exchange: ExchangeFalso) -> list[Envelope]:
    return [Envelope.model_validate_json(message.body) for message, _ in exchange.mensagens]


async def _registrar(redis: RedisCluster, celulas: list[str]) -> None:
    for celula in celulas:
        await ambiente.registrar_interesse(redis, celula, AGORA)


async def test_coletar_vencidas_le_e_publica_so_as_vencidas(redis: RedisCluster) -> None:
    celulas = ["6gycf", "6gyce", "6gycg"]
    await _registrar(redis, celulas)
    await ambiente.marcar_coletada(redis, celulas[1], AGORA - INTERVALO - 1)
    await ambiente.marcar_coletada(redis, celulas[2], AGORA - 10)

    fonte = FonteFalsa()
    exchange = ExchangeFalso()

    publicadas = await coletor.coletar_vencidas(
        redis, fonte, cast(AbstractExchange, exchange), INTERVALO, AGORA
    )

    assert publicadas == 2
    assert set(fonte.chamadas) == {celulas[0], celulas[1]}
    assert len(exchange.mensagens) == 2

    coletadas = await ambiente.coletadas_em(redis, celulas)
    assert coletadas[celulas[0]] == AGORA
    assert coletadas[celulas[1]] == AGORA
    assert coletadas[celulas[2]] == AGORA - 10


async def test_coletar_vencidas_publica_envelope_valido(redis: RedisCluster) -> None:
    celulas = ["6gycf", "6gyce"]
    await _registrar(redis, celulas)
    exchange = ExchangeFalso()

    await coletor.coletar_vencidas(
        redis, FonteFalsa(), cast(AbstractExchange, exchange), INTERVALO, AGORA
    )

    assert len(exchange.mensagens) == len(celulas)
    for mensagem, routing_key in exchange.mensagens:
        envelope = Envelope.model_validate_json(mensagem.body)
        leitura = LeituraAmbiente.model_validate(envelope.payload)

        assert routing_key == EventType.LEITURA_AMBIENTE.value
        assert envelope.type == EventType.LEITURA_AMBIENTE
        assert len(envelope.geohash) == 6
        assert envelope.geohash[:5] == leitura.geohash
        assert leitura.geohash in celulas
        assert mensagem.message_id == str(envelope.event_id)
        assert mensagem.content_type == "application/json"
        assert mensagem.headers is not None
        assert mensagem.headers["geohash5"] == envelope.geohash[:5]


async def test_falha_numa_celula_nao_impede_as_outras(redis: RedisCluster) -> None:
    celulas = ["6gycf", "6gyce", "6gycg"]
    await _registrar(redis, celulas)

    fonte = FonteFalsa(falhar_em={celulas[1]})
    exchange = ExchangeFalso()

    publicadas = await coletor.coletar_vencidas(
        redis, fonte, cast(AbstractExchange, exchange), INTERVALO, AGORA
    )

    assert publicadas == 2
    assert set(fonte.chamadas) == set(celulas)
    assert set(await ambiente.coletadas_em(redis, celulas)) == {celulas[0], celulas[2]}
    assert {envelope.geohash[:5] for envelope in _envelopes(exchange)} == {
        celulas[0],
        celulas[2],
    }


async def test_nao_marca_coletada_quando_o_publish_falha(redis: RedisCluster) -> None:
    celulas = ["6gycf", "6gyce"]
    await _registrar(redis, celulas)

    publicadas = await coletor.coletar_vencidas(
        redis,
        FonteFalsa(),
        cast(AbstractExchange, ExchangeQueFalha()),
        INTERVALO,
        AGORA,
    )

    assert publicadas == 0
    assert await ambiente.coletadas_em(redis, celulas) == {}
