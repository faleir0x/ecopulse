import pytest
from redis.asyncio.cluster import ClusterNode

from ecopulse_common.cache import _remap_localhost, parse_nodes


def test_parse_nodes() -> None:
    nodes = parse_nodes("h1:7001,h2:7002,h3:7003")

    assert [(node.host, node.port) for node in nodes] == [
        ("h1", 7001),
        ("h2", 7002),
        ("h3", 7003),
    ]
    assert all(isinstance(node, ClusterNode) for node in nodes)


def test_parse_nodes_aceita_espacos() -> None:
    nodes = parse_nodes(" h1:7001 ,  h2:7002 ")

    assert [(node.host, node.port) for node in nodes] == [("h1", 7001), ("h2", 7002)]


def test_parse_nodes_um_no() -> None:
    nodes = parse_nodes("h1:7001")

    assert len(nodes) == 1
    assert nodes[0].host == "h1"
    assert nodes[0].port == 7001


@pytest.mark.parametrize(
    "raw",
    [
        "",
        "   ",
        ",",
        "h1",
        ":7001",
        "h1:",
        "h1:abc",
        "h1:7001,",
        "h1:7001:7002",
        "h1:0",
        "h1:70000",
    ],
)
def test_parse_nodes_invalidos(raw: str) -> None:
    with pytest.raises(ValueError):
        parse_nodes(raw)


def test_remap_localhost_mantem_porta() -> None:
    assert _remap_localhost(("redis-1", 7001)) == ("localhost", 7001)
    assert _remap_localhost(("10.89.70.11", 7003)) == ("localhost", 7003)
