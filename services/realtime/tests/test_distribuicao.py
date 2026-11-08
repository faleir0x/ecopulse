from typing import cast

from redis.asyncio.cluster import RedisCluster

from ecopulse_realtime import protocolo
from ecopulse_realtime.distribuicao import (
    TAMANHO_FILA_CLIENTE,
    Cliente,
    Distribuidor,
)


class _PubSubFalso:
    def __init__(self) -> None:
        self.canais: set[str] = set()

    async def ssubscribe(self, *canais: str) -> None:
        self.canais.update(canais)

    async def sunsubscribe(self, *canais: str) -> None:
        self.canais.difference_update(canais)

    async def aclose(self) -> None:
        pass


class _RedisFalso:
    def __init__(self) -> None:
        self.pubsub_falso = _PubSubFalso()

    def pubsub(self) -> _PubSubFalso:
        return self.pubsub_falso


def _distribuidor() -> tuple[Distribuidor, _RedisFalso]:
    falso = _RedisFalso()
    return Distribuidor(cast(RedisCluster, falso)), falso


async def test_entregar_marca_lento_quando_a_fila_do_cliente_esta_cheia() -> None:
    distribuidor, _ = _distribuidor()
    cliente = Cliente()
    celula = "eycs20"
    await distribuidor.definir(cliente, frozenset({celula}))

    for indice in range(TAMANHO_FILA_CLIENTE):
        distribuidor.entregar(celula, f"mensagem-{indice}")

    assert not cliente.lento.is_set()
    distribuidor.entregar(celula, "excedente")

    assert cliente.lento.is_set()
    assert cliente.saida.qsize() == TAMANHO_FILA_CLIENTE


async def test_entregar_so_alcanca_clientes_da_celula() -> None:
    distribuidor, _ = _distribuidor()
    cliente = Cliente()
    await distribuidor.definir(cliente, frozenset({"eycs20"}))

    distribuidor.entregar("eycs24", "outra célula")
    assert cliente.saida.empty()

    distribuidor.entregar("eycs20", "minha célula")
    assert cliente.saida.get_nowait() == "minha célula"


async def test_assinatura_no_redis_so_sai_com_o_ultimo_cliente() -> None:
    distribuidor, falso = _distribuidor()
    canal = protocolo.canal("eycs20")
    primeiro = Cliente()
    segundo = Cliente()

    await distribuidor.definir(primeiro, frozenset({"eycs20"}))
    await distribuidor.definir(segundo, frozenset({"eycs20"}))
    assert falso.pubsub_falso.canais == {canal}

    await distribuidor.remover(primeiro)
    assert falso.pubsub_falso.canais == {canal}

    await distribuidor.remover(segundo)
    assert falso.pubsub_falso.canais == set()
