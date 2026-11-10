import pytest

from ecopulse_common.rede import ip_cliente, redes_confiaveis

CONFIAVEIS = redes_confiaveis("10.89.70.250, 10.0.9.0/24")


def test_ip_e_faixa() -> None:
    assert [str(r) for r in CONFIAVEIS] == ["10.89.70.250/32", "10.0.9.0/24"]


def test_entrada_invalida() -> None:
    with pytest.raises(ValueError):
        redes_confiaveis("nao-e-ip")


def test_cabecalho_de_proxy_confiavel_por_ip() -> None:
    assert ip_cliente("10.89.70.250", {"cf-connecting-ip": "200.1.2.3"}, CONFIAVEIS) == "200.1.2.3"


def test_x_real_ip_de_proxy_na_faixa() -> None:
    assert ip_cliente("10.0.9.17", {"x-real-ip": "200.1.2.3"}, CONFIAVEIS) == "200.1.2.3"


def test_cf_tem_preferencia() -> None:
    cabecalhos = {"cf-connecting-ip": "200.1.2.3", "x-real-ip": "10.0.9.1"}
    assert ip_cliente("10.0.9.17", cabecalhos, CONFIAVEIS) == "200.1.2.3"


def test_cabecalho_de_quem_nao_e_proxy_e_ignorado() -> None:
    assert ip_cliente("200.9.9.9", {"x-real-ip": "1.1.1.1"}, CONFIAVEIS) == "200.9.9.9"


def test_cabecalho_invalido_cai_no_direto() -> None:
    assert ip_cliente("10.0.9.17", {"x-real-ip": "lixo"}, CONFIAVEIS) == "10.0.9.17"


def test_ipv6_vira_64() -> None:
    assert ip_cliente("10.0.9.17", {"x-real-ip": "2001:db8:1:2:3:4:5:6"}, CONFIAVEIS) == (
        "2001:db8:1:2::/64"
    )


def test_direto_nao_ip() -> None:
    assert ip_cliente("testclient", {}, CONFIAVEIS) == "testclient"
