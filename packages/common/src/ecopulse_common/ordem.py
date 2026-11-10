"""Ordem dos eventos de uma ocorrência entregues fora de ordem.

Cada ocorrência tem uma `versao` que o banco incrementa em toda alteração (serializada pelo
lock da linha). Cada consumidor guarda no Redis a MAIOR versão já vista por ocorrência e
descarta eventos com versão MENOR. Versão igual passa: é reentrega do mesmo evento e o
consumidor é idempotente.

A comparação e a gravação acontecem num único script Lua, então duas réplicas do consumidor
não conseguem se atropelar. A chave usa hash tag ({ocorrencia_id}) para ficar num slot só.
"""

from redis.asyncio.cluster import RedisCluster

TTL_VERSAO_S = 7 * 24 * 3600

_SCRIPT = """
local atual = tonumber(redis.call('GET', KEYS[1]) or '0')
local nova = tonumber(ARGV[1])
if nova < atual then
  return 0
end
redis.call('SET', KEYS[1], tostring(math.max(atual, nova)), 'EX', tonumber(ARGV[2]))
return 1
"""


def chave_versao(consumidor: str, ocorrencia_id: int) -> str:
    """Chave do Redis com a maior versão vista por `consumidor` para a ocorrência."""
    return f"versao:{consumidor}:{{{ocorrencia_id}}}"


async def versao_atual(
    redis: RedisCluster, consumidor: str, ocorrencia_id: int, versao: int
) -> bool:
    """True se `versao` pode ser processada; False se é mais antiga que a já vista.

    Se `versao` for menor que o valor guardado, não muda nada e retorna False. Senão grava
    max(guardado, versao) com TTL_VERSAO_S e retorna True.
    """
    resultado = await redis.eval(
        _SCRIPT, 1, chave_versao(consumidor, ocorrencia_id), versao, TTL_VERSAO_S
    )
    return bool(int(resultado))
