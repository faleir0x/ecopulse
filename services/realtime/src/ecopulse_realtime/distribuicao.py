"""Entrega dos alertas aos WebSockets desta instância.

Cada cliente tem uma fila de saída limitada. Cliente lento (fila cheia) é desconectado em vez
de atrasar os outros: backpressure explícito. O app reconecta e recarrega o estado pelo GET.
"""

import asyncio
import contextlib
import logging
from dataclasses import dataclass, field

from redis.asyncio.cluster import ClusterPubSub, RedisCluster
from redis.exceptions import RedisError

from ecopulse_realtime import protocolo
from ecopulse_realtime.assinaturas import Assinaturas, Mudanca

log = logging.getLogger(__name__)

TAMANHO_FILA_CLIENTE = 100


@dataclass(eq=False)  # identidade como chave de dicionário
class Cliente:
    saida: asyncio.Queue[str] = field(
        default_factory=lambda: asyncio.Queue(maxsize=TAMANHO_FILA_CLIENTE)
    )
    lento: asyncio.Event = field(default_factory=asyncio.Event)


class Distribuidor:
    """Mantém UM ClusterPubSub (redis.pubsub()) e as assinaturas desta instância."""

    def __init__(self, redis: RedisCluster) -> None:
        self.redis = redis
        self.assinaturas: Assinaturas[Cliente] = Assinaturas()
        self.pubsub: ClusterPubSub = redis.pubsub()
        self._lock = asyncio.Lock()

    async def definir(self, cliente: Cliente, celulas: frozenset[str]) -> None:
        """Atualiza as assinaturas e aplica a Mudanca no Redis (ssubscribe/sunsubscribe
        dos canais protocolo.canal(c))."""
        mudanca = self.assinaturas.definir(cliente, celulas)
        await self._aplicar(mudanca)

    async def remover(self, cliente: Cliente) -> None:
        mudanca = self.assinaturas.remover(cliente)
        await self._aplicar(mudanca)

    async def _aplicar(self, mudanca: Mudanca) -> None:
        if not mudanca.entrar and not mudanca.sair:
            return

        async with self._lock:
            if mudanca.sair:
                await self.pubsub.sunsubscribe(
                    *(protocolo.canal(celula) for celula in sorted(mudanca.sair))
                )
            if mudanca.entrar:
                await self.pubsub.ssubscribe(
                    *(protocolo.canal(celula) for celula in sorted(mudanca.entrar))
                )

    def entregar(self, celula: str, mensagem: str) -> None:
        """put_nowait na fila de cada cliente da célula; fila cheia → cliente.lento.set()."""
        for cliente in self.assinaturas.clientes(celula):
            try:
                cliente.saida.put_nowait(mensagem)
            except asyncio.QueueFull:
                cliente.lento.set()

    async def rodar(self, parar: asyncio.Event) -> None:
        """Laço até `parar`: get_sharded_message(ignore_subscribe_messages=True, timeout=1.0);
        mensagem → entregar(celula_do_canal(canal), dados). Sem nenhuma assinatura, só espera
        (não chame get_sharded_message sem canais). RedisError → loga, espera 1 s, continua."""
        while not parar.is_set():
            if not self.pubsub.subscribed:
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(parar.wait(), timeout=0.2)
                continue

            try:
                mensagem = await self.pubsub.get_sharded_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
            except RedisError as exc:
                log.warning(
                    "falha ao ler o pub/sub",
                    extra={"error": f"{type(exc).__name__}: {exc}"},
                )
                await asyncio.sleep(1)
                continue

            if mensagem is None:
                continue

            canal = mensagem.get("channel")
            dados = mensagem.get("data")
            if not isinstance(canal, (str, bytes)) or not isinstance(dados, (str, bytes)):
                continue
            if isinstance(canal, bytes):
                canal = canal.decode()
            if isinstance(dados, bytes):
                dados = dados.decode()

            try:
                celula = protocolo.celula_do_canal(canal)
            except ValueError:
                continue
            self.entregar(celula, dados)

    async def fechar(self) -> None:
        await self.pubsub.aclose()
