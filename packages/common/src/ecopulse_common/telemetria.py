"""Presença de aparelhos por célula geohash6 (telemetria dos celulares).

Sorted set por célula no Redis Cluster: membro = device_id, score = epoch (s) do último sinal.
Escrito pelo processor (consumidor de telemetria.aparelho) e lido pela API. Chave com hash tag
da célula: cada célula num slot, espalhadas pelos nós do cluster (sharding por região).
"""

from redis.asyncio.cluster import RedisCluster

# Aparelho conta como presente por este tempo depois do último sinal
JANELA_PRESENCA_S = 15 * 60


def chave_presenca(geohash6: str) -> str:
    return f"presenca:{{{geohash6}}}"


async def registrar_presenca(
    redis: RedisCluster, geohash6: str, device_id: str, agora_s: float
) -> None:
    """ZADD do aparelho com o horário do sinal, remove quem saiu da janela e renova o TTL da
    chave (JANELA_PRESENCA_S), para célula sem ninguém sumir sozinha."""
    chave = chave_presenca(geohash6)
    limite = agora_s - JANELA_PRESENCA_S
    await redis.zadd(chave, {device_id: agora_s})
    await redis.zremrangebyscore(chave, "-inf", f"({limite}")
    await redis.expire(chave, JANELA_PRESENCA_S)


async def contar_presenca(redis: RedisCluster, celulas: list[str], agora_s: float) -> int:
    """Total de aparelhos distintos com sinal na janela, somando as células (um ZCOUNT por
    célula; um aparelho só fica em uma célula por vez na prática, então somar basta)."""
    limite = agora_s - JANELA_PRESENCA_S
    total = 0
    for celula in celulas:
        total += int(await redis.zcount(chave_presenca(celula), limite, "+inf"))
    return total
