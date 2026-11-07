"""Rate limit por aparelho com token bucket no Redis Cluster.

O balde inteiro vive numa chave (hash) e é atualizado por um script Lua, então a leitura e a
escrita são atômicas mesmo com várias réplicas da API. O relógio é o do Redis (TIME), não o
das réplicas, para que todas enxerguem o mesmo tempo.
Se o Redis falhar, a requisição passa (fail-open): o limite protege contra spam, não é
requisito para aceitar relatos.
"""

import logging
import math
from dataclasses import dataclass
from uuid import UUID

from redis.asyncio.cluster import RedisCluster
from redis.exceptions import RedisError

log = logging.getLogger(__name__)

# 10 relatos em rajada; depois, 1 a cada 30 s
CAPACIDADE = 10
TOKENS_POR_SEGUNDO = 1 / 30

_SCRIPT = """
local capacidade = tonumber(ARGV[1])
local taxa = tonumber(ARGV[2])
local t = redis.call('TIME')
local agora = tonumber(t[1]) + tonumber(t[2]) / 1000000

local balde = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(balde[1]) or capacidade
local ts = tonumber(balde[2]) or agora
tokens = math.min(capacidade, tokens + math.max(0, agora - ts) * taxa)

local permitido = 0
local espera = 0
if tokens >= 1 then
  permitido = 1
  tokens = tokens - 1
else
  espera = (1 - tokens) / taxa
end

-- tostring: número Lua passado ao Redis seria truncado para inteiro
redis.call('HSET', KEYS[1], 'tokens', tostring(tokens), 'ts', tostring(agora))
redis.call('EXPIRE', KEYS[1], math.ceil(capacidade / taxa))
return {permitido, tostring(espera)}
"""


@dataclass(frozen=True)
class Resultado:
    permitido: bool
    retry_after_s: int  # 0 quando permitido


def chave(device_id: UUID) -> str:
    return f"rl:{{{device_id}}}"


async def consumir(
    redis: RedisCluster,
    device_id: UUID,
    capacidade: int = CAPACIDADE,
    tokens_por_segundo: float = TOKENS_POR_SEGUNDO,
) -> Resultado:
    """Tenta gastar 1 token do aparelho."""
    try:
        permitido, espera = await redis.eval(
            _SCRIPT, 1, chave(device_id), capacidade, tokens_por_segundo
        )
    except RedisError:
        log.warning("rate limit indisponível; liberando", extra={"device_id": str(device_id)})
        return Resultado(permitido=True, retry_after_s=0)
    if int(permitido):
        return Resultado(permitido=True, retry_after_s=0)
    return Resultado(permitido=False, retry_after_s=max(1, math.ceil(float(espera))))
