import asyncio
from datetime import timedelta
from typing import cast
from uuid import uuid4

import asyncpg
import pytest
from aio_pika.abc import AbstractExchange
from fastapi.testclient import TestClient
from redis.asyncio.cluster import RedisCluster
from redis.exceptions import RedisError

from ecopulse_api import invalidacao, leitura
from ecopulse_common import geohash, messaging
from ecopulse_common.config import Settings
from ecopulse_common.events import (
    Envelope,
    EventType,
    Severidade,
    StatusOcorrencia,
    TipoRisco,
)

pytestmark = pytest.mark.integration

LATITUDE = 38.72
LONGITUDE = -9.14
BBOX = "-9.15,38.70,-9.12,38.74"


def _bbox_da_celula(celula: str) -> tuple[float, float, float, float]:
    lat_min, lon_min, lat_max, lon_max = geohash.decode_bbox(celula)
    return lon_min, lat_min, lon_max, lat_max


def _celula_da_ocorrencia() -> str:
    return geohash.encode(LATITUDE, LONGITUDE, geohash.PARTITION_PRECISION)


async def _inserir(
    pool: asyncpg.Pool,
    *,
    tipo: TipoRisco = TipoRisco.ALAGAMENTO,
    severidade: Severidade = Severidade.ALTO,
    latitude: float = LATITUDE,
    longitude: float = LONGITUDE,
    status: StatusOcorrencia = StatusOcorrencia.ATIVA,
    validade: timedelta = timedelta(hours=1),
) -> int:
    codigo = geohash.encode(latitude, longitude, geohash.CELL_PRECISION)
    async with pool.acquire() as conn:
        ocorrencia_id = await conn.fetchval(
            """
            INSERT INTO ocorrencias (
                tipo, severidade, geom, geohash, confirmacoes, status, expira_em
            )
            VALUES (
                $1, $2,
                ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
                $5, 1, $6, now() + $7::interval
            )
            RETURNING id
            """,
            tipo.value,
            severidade.value,
            latitude,
            longitude,
            codigo,
            status.value,
            validade,
        )
    assert ocorrencia_id is not None
    return int(ocorrencia_id)


async def _apagar_do_banco(pool: asyncpg.Pool, ocorrencia_id: int) -> None:
    async with pool.acquire() as conn:
        await conn.execute("DELETE FROM ocorrencias WHERE id = $1", ocorrencia_id)


class _RedisQuebrado:
    async def mget_nonatomic(self, *_: object, **__: object) -> list[str | None]:
        raise RedisError("cache indisponível")

    async def delete(self, *_: object, **__: object) -> int:
        raise RedisError("cache indisponível")

    def pipeline(self, *_: object, **__: object) -> object:
        raise RedisError("cache indisponível")


async def test_ocorrencias_por_celulas_miss_e_hit(pool: asyncpg.Pool, redis: RedisCluster) -> None:
    ocorrencia_id = await _inserir(pool)
    celula = _celula_da_ocorrencia()
    chave = leitura.chave_celula(celula)
    celulas = leitura.celulas_do_bbox(*_bbox_da_celula(celula))

    await redis.delete(chave)
    primeira = await leitura.ocorrencias_por_celulas(pool, redis, celulas)

    assert ocorrencia_id in {ocorrencia.id for ocorrencia in primeira}
    ttl = await redis.ttl(chave)
    assert 0 < ttl <= leitura.CACHE_TTL_S

    await _apagar_do_banco(pool, ocorrencia_id)
    segunda = await leitura.ocorrencias_por_celulas(pool, redis, celulas)

    assert ocorrencia_id in {ocorrencia.id for ocorrencia in segunda}


async def test_ocorrencias_por_celulas_cacheia_celula_vazia(
    pool: asyncpg.Pool, redis: RedisCluster
) -> None:
    celula = geohash.encode(38.80, -9.25, geohash.PARTITION_PRECISION)
    chave = leitura.chave_celula(celula)
    celulas = leitura.celulas_do_bbox(*_bbox_da_celula(celula))

    resultado = await leitura.ocorrencias_por_celulas(pool, redis, celulas)

    assert resultado == []
    assert await redis.get(chave) == "[]"
    ttl = await redis.ttl(chave)
    assert 0 < ttl <= leitura.CACHE_TTL_S


async def test_ocorrencias_por_celulas_redis_fora_usa_banco(pool: asyncpg.Pool) -> None:
    ocorrencia_id = await _inserir(pool)
    celula = _celula_da_ocorrencia()
    celulas = leitura.celulas_do_bbox(*_bbox_da_celula(celula))

    resultado = await leitura.ocorrencias_por_celulas(
        pool, cast(RedisCluster, _RedisQuebrado()), celulas
    )

    assert ocorrencia_id in {ocorrencia.id for ocorrencia in resultado}


async def test_buscar_ocorrencia_existente_e_inexistente(pool: asyncpg.Pool) -> None:
    ativa_id = await _inserir(pool)
    expirada_id = await _inserir(
        pool, status=StatusOcorrencia.EXPIRADA, validade=timedelta(hours=-1)
    )

    ativa = await leitura.buscar_ocorrencia(pool, ativa_id)
    expirada = await leitura.buscar_ocorrencia(pool, expirada_id)

    assert ativa is not None
    assert ativa.id == ativa_id
    assert ativa.tipo is TipoRisco.ALAGAMENTO
    assert expirada is not None
    assert expirada.status is StatusOcorrencia.EXPIRADA
    assert await leitura.buscar_ocorrencia(pool, 999_999) is None


async def test_evento_de_ocorrencia_apaga_chave_da_celula(
    pool: asyncpg.Pool, redis: RedisCluster
) -> None:
    settings = Settings()
    try:
        connection = await messaging.connect(settings.rabbit_url)
    except Exception as exc:
        pytest.skip(f"RabbitMQ indisponível em {settings.rabbit_url}: {exc}")

    celula = _celula_da_ocorrencia()
    chave = leitura.chave_celula(celula)
    await redis.set(chave, "[]", ex=leitura.CACHE_TTL_S)

    channel = await connection.channel()
    try:
        topology = await messaging.declare_topology(channel, settings.partitions)
        await invalidacao.iniciar(channel, topology.events, redis)

        envelope = Envelope(
            type=EventType.OCORRENCIA_ATUALIZADA,
            geohash=geohash.encode(LATITUDE, LONGITUDE, geohash.CELL_PRECISION),
            payload={"id": 1},
        )
        await messaging.publish(topology.events, envelope)

        for _ in range(50):
            if not await redis.exists(chave):
                break
            await asyncio.sleep(0.1)

        assert not await redis.exists(chave)
    finally:
        await connection.close()


async def test_endpoint_lista_ocorrencias_com_bbox_valido(
    cliente: TestClient, pool: asyncpg.Pool, redis: RedisCluster
) -> None:
    del redis
    ocorrencia_id = await _inserir(pool)

    resposta = cliente.get("/v1/ocorrencias", params={"bbox": BBOX})

    assert resposta.status_code == 200
    assert ocorrencia_id in {item["id"] for item in resposta.json()}


@pytest.mark.parametrize("bbox", ["a,b,c,d", "-9.1,38.7,-9.2,38.8"])
async def test_endpoint_lista_ocorrencias_bbox_invalido(
    cliente: TestClient, redis: RedisCluster, bbox: str
) -> None:
    del redis
    resposta = cliente.get("/v1/ocorrencias", params={"bbox": bbox})

    assert resposta.status_code == 400


async def test_endpoint_lista_ocorrencias_bbox_gigante(
    cliente: TestClient, redis: RedisCluster
) -> None:
    del redis
    resposta = cliente.get("/v1/ocorrencias", params={"bbox": "-180,-90,180,90"})

    assert resposta.status_code == 400


async def test_endpoint_lista_ocorrencias_filtra_por_tipo(
    cliente: TestClient, pool: asyncpg.Pool, redis: RedisCluster
) -> None:
    del redis
    await _inserir(pool, tipo=TipoRisco.ALAGAMENTO)
    calor_id = await _inserir(pool, tipo=TipoRisco.CALOR)

    resposta = cliente.get("/v1/ocorrencias", params={"bbox": BBOX, "tipo": "calor"})

    assert resposta.status_code == 200
    assert [item["id"] for item in resposta.json()] == [calor_id]


async def test_endpoint_detalha_ocorrencia(
    cliente: TestClient, pool: asyncpg.Pool, redis: RedisCluster
) -> None:
    del redis
    ocorrencia_id = await _inserir(pool)

    resposta = cliente.get(f"/v1/ocorrencias/{ocorrencia_id}")

    assert resposta.status_code == 200
    assert resposta.json()["id"] == ocorrencia_id
    assert cliente.get("/v1/ocorrencias/999999").status_code == 404


def _confirmacao() -> dict[str, str]:
    return {
        "client_id": str(uuid4()),
        "device_id": str(uuid4()),
        "registrado_em": "2026-11-07T12:00:00Z",
    }


async def test_endpoint_confirma_ocorrencia_ativa(
    cliente: TestClient,
    pool: asyncpg.Pool,
    redis: RedisCluster,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    del redis
    ocorrencia_id = await _inserir(pool)
    publicados: list[Envelope] = []

    async def fake_publish(exchange: AbstractExchange, envelope: Envelope, **_: object) -> None:
        publicados.append(envelope)

    monkeypatch.setattr(messaging, "publish", fake_publish)

    resposta = cliente.post(f"/v1/ocorrencias/{ocorrencia_id}/confirmacoes", json=_confirmacao())

    assert resposta.status_code == 202
    assert [envelope.type for envelope in publicados] == [EventType.RELATO_RECEBIDO]


async def test_endpoint_confirma_ocorrencia_inexistente(
    cliente: TestClient, redis: RedisCluster
) -> None:
    del redis
    resposta = cliente.post("/v1/ocorrencias/999999/confirmacoes", json=_confirmacao())

    assert resposta.status_code == 404


async def test_endpoint_confirma_ocorrencia_expirada(
    cliente: TestClient, pool: asyncpg.Pool, redis: RedisCluster
) -> None:
    del redis
    ocorrencia_id = await _inserir(
        pool, status=StatusOcorrencia.EXPIRADA, validade=timedelta(hours=-1)
    )

    resposta = cliente.post(f"/v1/ocorrencias/{ocorrencia_id}/confirmacoes", json=_confirmacao())

    assert resposta.status_code == 409
