"""Células de interesse do serviço environment (compartilhado entre api e environment).

A API registra a célula geohash5 de quem pediu `GET /v1/ambiente`; o environment coleta só
as células pedidas nas últimas 24 h. Sorted set no Redis Cluster: membro = geohash5,
score = epoch (s) do último pedido. Chave com hash tag fixa (um slot só).
"""

from redis.asyncio.cluster import RedisCluster

CHAVE_INTERESSE = "{ambiente}:interesse"
CHAVE_COLETADO = "{ambiente}:coletado"  # hash geohash5 → epoch da última coleta
JANELA_INTERESSE_S = 24 * 3600
MAX_CELULAS_INTERESSE = 400


async def registrar_interesse(redis: RedisCluster, geohash5: str, agora_s: float) -> bool:
    """ZADD com o horário do pedido (atualiza o score se já existir).

    O conjunto tem no máximo MAX_CELULAS_INTERESSE células (teto da cota da Open-Meteo): uma
    célula nova num conjunto cheio entra no lugar da pedida há mais tempo (ZPOPMIN), que sai
    também do hash de coletadas. Assim a camada nunca para de carregar — antes, com o conjunto
    cheio, células novas eram recusadas por até 24 h. Sempre True (mantido por compatibilidade).
    """
    if await redis.zscore(CHAVE_INTERESSE, geohash5) is None:
        excesso = await redis.zcard(CHAVE_INTERESSE) - MAX_CELULAS_INTERESSE + 1
        if excesso > 0:
            expulsas = await redis.zpopmin(CHAVE_INTERESSE, excesso)
            celulas = [str(par[0]) for par in expulsas]  # (membro, score)
            if celulas:
                await redis.hdel(CHAVE_COLETADO, *celulas)
    await redis.zadd(CHAVE_INTERESSE, {geohash5: agora_s})
    return True


async def celulas_ativas(redis: RedisCluster, agora_s: float) -> list[str]:
    """Células pedidas na janela (ZRANGEBYSCORE agora-JANELA..+inf); remove as mais antigas
    (ZREMRANGEBYSCORE) e as mesmas do hash de coletadas (HDEL), para nada crescer para sempre."""
    limite = agora_s - JANELA_INTERESSE_S
    expiradas = await redis.zrangebyscore(CHAVE_INTERESSE, "-inf", f"({limite}")
    if expiradas:
        celulas = [str(m) for m in expiradas]
        await redis.hdel(CHAVE_COLETADO, *celulas)
        await redis.zremrangebyscore(CHAVE_INTERESSE, "-inf", f"({limite}")
    membros = await redis.zrangebyscore(CHAVE_INTERESSE, limite, "+inf")
    return [str(m) for m in membros]


async def coletadas_em(redis: RedisCluster, celulas: list[str]) -> dict[str, float]:
    """Epoch da última coleta de cada célula (ausente = nunca coletada)."""
    if not celulas:
        return {}
    valores = await redis.hmget(CHAVE_COLETADO, celulas)
    return {c: float(v) for c, v in zip(celulas, valores, strict=True) if v is not None}


async def marcar_coletada(redis: RedisCluster, geohash5: str, agora_s: float) -> None:
    await redis.hset(CHAVE_COLETADO, geohash5, str(agora_s))
