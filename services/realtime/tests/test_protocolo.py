import pytest

from ecopulse_common import geohash
from ecopulse_realtime import protocolo


def _celulas(quantidade: int) -> list[str]:
    return [geohash.encode(-23.5 + indice * 0.1, -46.6, 6) for indice in range(quantidade)]


def test_canal_e_celula_do_canal_ida_e_volta() -> None:
    celula = geohash.encode(38.72, -9.14, 6)

    assert protocolo.canal(celula) == f"ocorrencias:{{{celula}}}"
    assert protocolo.celula_do_canal(protocolo.canal(celula)) == celula


@pytest.mark.parametrize(
    "nome",
    ["", "ocorrencias:", "ocorrencias:eycs20", "{eycs20}", "outro:{eycs20}", "ocorrencias:{}"],
)
def test_celula_do_canal_rejeita_formato_invalido(nome: str) -> None:
    with pytest.raises(ValueError):
        protocolo.celula_do_canal(nome)


def test_validar_celulas_ordena_e_remove_repeticao() -> None:
    celulas = ["eycs24", "eycs20", "eycs24"]

    assert protocolo.validar_celulas(celulas) == ["eycs20", "eycs24"]


@pytest.mark.parametrize("celula", ["", "eycs2", "eycs200", "eycs2!", "abcde"])
def test_validar_celulas_rejeita_invalida(celula: str) -> None:
    with pytest.raises(ValueError):
        protocolo.validar_celulas([celula])


def test_validar_celulas_respeita_o_limite_apos_deduplicar() -> None:
    validas = _celulas(protocolo.MAX_CELULAS_POR_CLIENTE)

    assert protocolo.validar_celulas(validas) == sorted(validas)
    assert len(protocolo.validar_celulas([*validas, validas[0]])) == len(validas)

    with pytest.raises(ValueError):
        protocolo.validar_celulas(_celulas(protocolo.MAX_CELULAS_POR_CLIENTE + 1))
