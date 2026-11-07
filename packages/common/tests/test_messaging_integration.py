import asyncio
from collections import defaultdict

import pytest
from aio_pika.abc import AbstractChannel

from ecopulse_common.config import Settings
from ecopulse_common.consumer import handle_message
from ecopulse_common.events import Envelope, EventType
from ecopulse_common.geohash import encode
from ecopulse_common.messaging import (
    ATTEMPT_HEADER,
    DLQ,
    ERROR_HEADER,
    RETRY_DELAYS_MS,
    connect,
    declare_topology,
    partition_queue,
    publish,
    retry_queue,
)

N_PARTICOES = 3

PONTOS = [
    (-23.5505, -46.6333),
    (-22.9068, -43.1729),
    (-3.7319, -38.5267),
    (-8.0476, -34.8770),
    (-15.7939, -47.8828),
    (-25.4284, -49.2733),
    (-30.0346, -51.2177),
    (-12.9777, -38.5016),
    (-19.9167, -43.9345),
    (-1.4558, -48.4902),
]


async def _esvaziar_filas(channel: AbstractChannel, nomes: list[str]) -> None:
    for nome in nomes:
        queue = await channel.declare_queue(nome, durable=True, passive=True)
        await queue.purge()


async def _todas_as_filas() -> list[str]:
    return [
        *(partition_queue(i) for i in range(N_PARTICOES)),
        *(retry_queue(delay) for delay in RETRY_DELAYS_MS),
        DLQ,
    ]


@pytest.mark.integration
async def test_topologia_particiona_e_entrega_na_dlq() -> None:
    try:
        connection = await connect(Settings().rabbit_url)
    except Exception as exc:
        pytest.skip(f"RabbitMQ indisponível em {Settings().rabbit_url}: {exc}")

    channel = await connection.channel()
    nomes = await _todas_as_filas()
    try:
        topologia = await declare_topology(channel, N_PARTICOES)
        await _esvaziar_filas(channel, nomes)

        # (a) e (b): todos os 30 chegam e o mesmo geohash5 fica na mesma partição.
        envios: dict[str, str] = {}
        for indice in range(30):
            lat, lon = PONTOS[indice % len(PONTOS)]
            geohash = encode(lat, lon, 6)
            envelope = Envelope(
                type=EventType.RELATO_RECEBIDO,
                geohash=geohash,
                payload={"indice": indice},
            )
            envios[str(envelope.event_id)] = geohash[:5]
            await publish(topologia.events, envelope)

        recebidos: dict[str, int] = {}
        particoes_por_geohash5: dict[str, set[int]] = defaultdict(set)
        for particao in range(N_PARTICOES):
            queue = await channel.declare_queue(
                partition_queue(particao), durable=True, passive=True
            )
            while True:
                message = await queue.get(no_ack=True, fail=False)
                if message is None:
                    break
                envelope = Envelope.model_validate_json(message.body)
                event_id = str(envelope.event_id)
                recebidos[event_id] = particao
                particoes_por_geohash5[envelope.geohash[:5]].add(particao)

        assert len(recebidos) == 30
        assert set(recebidos) == set(envios)
        for chave, particoes in particoes_por_geohash5.items():
            assert len(particoes) == 1, f"geohash5 {chave} caiu em partições {particoes}"

        # (c): tentativa esgotada vai direto para a DLQ, sem esperar os TTLs.
        envelope_dlq = Envelope(
            type=EventType.RELATO_RECEBIDO,
            geohash=encode(-23.5505, -46.6333, 6),
            payload={"dlq": True},
        )
        await publish(
            topologia.events,
            envelope_dlq,
            headers={ATTEMPT_HEADER: len(RETRY_DELAYS_MS)},
        )

        mensagem = None
        for particao in range(N_PARTICOES):
            queue = await channel.declare_queue(
                partition_queue(particao), durable=True, passive=True
            )
            while True:
                candidata = await queue.get(no_ack=False, fail=False)
                if candidata is None:
                    break
                if candidata.message_id == str(envelope_dlq.event_id):
                    mensagem = candidata
                else:
                    await candidata.ack()

        assert mensagem is not None

        async def falha(_: Envelope) -> None:
            raise RuntimeError("falha proposital")

        await handle_message(mensagem, falha, topologia)

        fila_dlq = await channel.declare_queue(DLQ, durable=True, passive=True)
        recebida = None
        for _ in range(50):
            candidata = await fila_dlq.get(no_ack=True, fail=False)
            while candidata is not None:
                if candidata.message_id == str(envelope_dlq.event_id):
                    recebida = candidata
                candidata = await fila_dlq.get(no_ack=True, fail=False)
            if recebida is not None:
                break
            await asyncio.sleep(0.1)

        assert recebida is not None
        assert recebida.headers is not None
        erro = recebida.headers.get(ERROR_HEADER)
        assert isinstance(erro, str)
        assert erro.startswith("RuntimeError")
    finally:
        await _esvaziar_filas(channel, nomes)
        await connection.close()
