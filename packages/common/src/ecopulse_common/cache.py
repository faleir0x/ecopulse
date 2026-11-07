"""Cliente do Redis Cluster (ver ADR 0005)."""

from redis.asyncio.cluster import ClusterNode, RedisCluster

from ecopulse_common.config import Settings


def parse_nodes(raw: str) -> list[ClusterNode]:
    """'h1:7001,h2:7002' → [ClusterNode('h1', 7001), ...]. ValueError se mal formado ou vazio."""
    if not raw or not raw.strip():
        raise ValueError("lista de nós Redis vazia")

    nodes: list[ClusterNode] = []
    for entrada in raw.split(","):
        item = entrada.strip()
        if not item:
            raise ValueError("nó Redis vazio")
        partes = item.split(":")
        if len(partes) != 2:
            raise ValueError(f"nó Redis mal formado: {item!r}")
        host, porta_texto = partes[0].strip(), partes[1].strip()
        if not host or not porta_texto:
            raise ValueError(f"nó Redis mal formado: {item!r}")
        try:
            porta = int(porta_texto)
        except ValueError as exc:
            raise ValueError(f"porta Redis inválida: {porta_texto!r}") from exc
        if not 0 < porta <= 65535:
            raise ValueError(f"porta Redis fora do intervalo: {porta}")
        nodes.append(ClusterNode(host, porta))

    return nodes


def _remap_localhost(address: tuple[str, int]) -> tuple[str, int]:
    return "localhost", address[1]


def create_cluster(settings: Settings) -> RedisCluster:
    """RedisCluster com decode_responses=True.

    Se settings.redis_remap_localhost, passa address_remap que troca o host anunciado
    ("redis-N") por "localhost", mantendo a porta.
    """
    nodes = parse_nodes(settings.redis_nodes)
    remap = _remap_localhost if settings.redis_remap_localhost else None
    return RedisCluster(startup_nodes=nodes, decode_responses=True, address_remap=remap)
