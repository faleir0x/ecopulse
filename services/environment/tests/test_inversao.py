from ecopulse_environment.inversao import avaliar_inversao

ELEVACAO_M = 737.0  # São Paulo


def test_inversao_quando_nivel_acima_do_terreno_esta_mais_quente() -> None:
    inversao, delta = avaliar_inversao(
        temperatura_2m=16.1,
        elevacao_m=ELEVACAO_M,
        niveis=[(18.9, 885.0), (8.4, 1590.0)],
    )

    assert inversao is True
    assert delta == 2.8


def test_sem_inversao_quando_nivel_acima_do_terreno_esta_mais_frio() -> None:
    inversao, delta = avaliar_inversao(
        temperatura_2m=16.1,
        elevacao_m=ELEVACAO_M,
        niveis=[(12.6, 885.0), (8.4, 1590.0)],
    )

    assert inversao is False
    assert delta == -3.5


def test_nivel_925_abaixo_do_terreno_usa_o_850() -> None:
    # Com elevação 900 m o limite é 1000 m: o 925 (885 m) fica abaixo e o 850 (1590 m) é usado.
    inversao, delta = avaliar_inversao(
        temperatura_2m=16.1,
        elevacao_m=900.0,
        niveis=[(20.0, 885.0), (20.0, 1590.0)],
    )

    assert inversao is True
    assert delta == 3.9


def test_dados_faltando_retornam_none() -> None:
    niveis: list[tuple[float | None, float | None]] = [(18.9, 885.0)]

    assert avaliar_inversao(None, ELEVACAO_M, niveis) == (None, None)
    assert avaliar_inversao(16.1, None, niveis) == (None, None)
    assert avaliar_inversao(16.1, ELEVACAO_M, []) == (None, None)
    assert avaliar_inversao(16.1, ELEVACAO_M, [(None, 885.0), (18.0, None)]) == (None, None)
    # Nível sem altura suficiente para passar do terreno também não serve.
    assert avaliar_inversao(16.1, ELEVACAO_M, [(18.9, 800.0)]) == (None, None)
