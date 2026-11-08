from ecopulse_realtime.assinaturas import Assinaturas, Mudanca


def test_dois_clientes_na_mesma_celula_so_o_ultimo_sai() -> None:
    assinaturas: Assinaturas[str] = Assinaturas()
    celula = "eycs20"

    assert assinaturas.definir("a", frozenset({celula})) == Mudanca(entrar=frozenset({celula}))
    assert assinaturas.definir("b", frozenset({celula})) == Mudanca()

    assert assinaturas.clientes(celula) == frozenset({"a", "b"})
    assert assinaturas.remover("a") == Mudanca()
    assert assinaturas.clientes(celula) == frozenset({"b"})
    assert assinaturas.remover("b") == Mudanca(sair=frozenset({celula}))
    assert assinaturas.clientes(celula) == frozenset()


def test_definir_substitui_o_conjunto_do_cliente() -> None:
    assinaturas: Assinaturas[str] = Assinaturas()
    assinaturas.definir("a", frozenset({"c1", "c2"}))

    mudanca = assinaturas.definir("a", frozenset({"c2", "c3"}))

    assert mudanca == Mudanca(entrar=frozenset({"c3"}), sair=frozenset({"c1"}))
    assert assinaturas.celulas() == frozenset({"c2", "c3"})
    assert assinaturas.clientes("c1") == frozenset()


def test_remover_cliente_desconhecido_nao_quebra() -> None:
    assinaturas: Assinaturas[str] = Assinaturas()

    assert assinaturas.remover("desconhecido") == Mudanca()
    assert assinaturas.celulas() == frozenset()


def test_definir_conjunto_vazio_remove_todas_as_celulas() -> None:
    assinaturas: Assinaturas[str] = Assinaturas()
    assinaturas.definir("a", frozenset({"c1"}))

    assert assinaturas.definir("a", frozenset()) == Mudanca(sair=frozenset({"c1"}))
    assert assinaturas.celulas() == frozenset()
