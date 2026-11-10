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

# Por IP: 60 relatos em rajada; depois, 1 por segundo
CAPACIDADE_IP = 60
TOKENS_POR_SEGUNDO_IP = 1.0
# Rotas gastam a cota do OpenRouteService (2 chamadas por rota): balde próprio por IP
CAPACIDADE_ROTA = 10
TOKENS_POR_SEGUNDO_ROTA = 1 / 30
# Votos ("já passou"/"ainda está"): o device_id é escolhido pelo cliente, então limita por IP
CAPACIDADE_VOTO = 10
TOKENS_POR_SEGUNDO_VOTO = 1 / 30
# Consultas ambientais: cada pedido registra interesse em células para a Open-Meteo
CAPACIDADE_AMBIENTE = 30
TOKENS_POR_SEGUNDO_AMBIENTE = 0.5

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


def chave_ip(ip: str) -> str:
    return f"rl:ip:{{{ip}}}"


# Busca de local: o app espera 400 ms entre teclas, mas uma busca ainda gera algumas chamadas
CAPACIDADE_LOCAL = 30
TOKENS_POR_SEGUNDO_LOCAL = 0.5


def chave_local(ip: str) -> str:
    return f"rl:local:{{{ip}}}"


def chave_rota(ip: str) -> str:
    return f"rl:rota:{{{ip}}}"


def chave_voto(ip: str) -> str:
    return f"rl:voto:{{{ip}}}"


def chave_ambiente(ip: str) -> str:
    return f"rl:ambiente:{{{ip}}}"


# Registro/renovação do aparelho: 5 em rajada; depois, 1 a cada 30 s
CAPACIDADE_APARELHO = 5
TOKENS_POR_SEGUNDO_APARELHO = 1 / 30


def chave_aparelho(ip: str) -> str:
    return f"rl:aparelho:{{{ip}}}"


async def _consumir(
    redis: RedisCluster,
    chave_balde: str,
    capacidade: int,
    tokens_por_segundo: float,
    contexto: dict[str, str],
) -> Resultado:
    try:
        permitido, espera = await redis.eval(
            _SCRIPT, 1, chave_balde, capacidade, tokens_por_segundo
        )
    except RedisError:
        log.warning("rate limit indisponível; liberando", extra=contexto)
        return Resultado(permitido=True, retry_after_s=0)
    if int(permitido):
        return Resultado(permitido=True, retry_after_s=0)
    return Resultado(permitido=False, retry_after_s=max(1, math.ceil(float(espera))))


async def consumir(
    redis: RedisCluster,
    device_id: UUID,
    capacidade: int = CAPACIDADE,
    tokens_por_segundo: float = TOKENS_POR_SEGUNDO,
) -> Resultado:
    """Tenta gastar 1 token do aparelho."""
    return await _consumir(
        redis,
        chave(device_id),
        capacidade,
        tokens_por_segundo,
        {"device_id": str(device_id)},
    )


async def consumir_ip(
    redis: RedisCluster,
    ip: str,
    capacidade: int = CAPACIDADE_IP,
    tokens_por_segundo: float = TOKENS_POR_SEGUNDO_IP,
) -> Resultado:
    """Tenta gastar 1 token do IP de origem (request.client.host, sem confiar em proxy)."""
    return await _consumir(
        redis,
        chave_ip(ip),
        capacidade,
        tokens_por_segundo,
        {"ip": ip},
    )


async def consumir_rota(
    redis: RedisCluster,
    ip: str,
    capacidade: int = CAPACIDADE_ROTA,
    tokens_por_segundo: float = TOKENS_POR_SEGUNDO_ROTA,
) -> Resultado:
    """Tenta gastar 1 token de rota do IP de origem."""
    return await _consumir(redis, chave_rota(ip), capacidade, tokens_por_segundo, {"ip": ip})


async def consumir_local(
    redis: RedisCluster,
    ip: str,
    capacidade: int = CAPACIDADE_LOCAL,
    tokens_por_segundo: float = TOKENS_POR_SEGUNDO_LOCAL,
) -> Resultado:
    """Tenta gastar 1 token de busca de local do IP de origem."""
    return await _consumir(redis, chave_local(ip), capacidade, tokens_por_segundo, {"ip": ip})


async def consumir_aparelho(
    redis: RedisCluster,
    ip: str,
    capacidade: int = CAPACIDADE_APARELHO,
    tokens_por_segundo: float = TOKENS_POR_SEGUNDO_APARELHO,
) -> Resultado:
    """Tenta gastar 1 token de registro de aparelho do IP de origem."""
    return await _consumir(redis, chave_aparelho(ip), capacidade, tokens_por_segundo, {"ip": ip})


async def consumir_voto(
    redis: RedisCluster,
    ip: str,
    capacidade: int = CAPACIDADE_VOTO,
    tokens_por_segundo: float = TOKENS_POR_SEGUNDO_VOTO,
) -> Resultado:
    """Tenta gastar 1 token de voto (confirmação/resolução) do IP de origem."""
    return await _consumir(redis, chave_voto(ip), capacidade, tokens_por_segundo, {"ip": ip})


async def consumir_ambiente(
    redis: RedisCluster,
    ip: str,
    capacidade: int = CAPACIDADE_AMBIENTE,
    tokens_por_segundo: float = TOKENS_POR_SEGUNDO_AMBIENTE,
) -> Resultado:
    """Tenta gastar 1 token de consulta ambiental do IP de origem."""
    return await _consumir(redis, chave_ambiente(ip), capacidade, tokens_por_segundo, {"ip": ip})
