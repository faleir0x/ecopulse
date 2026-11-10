"""A zona de influência é a mesma no servidor e no app (contrato entre as duas linguagens)."""

import re
from pathlib import Path

from ecopulse_common.events import Severidade
from ecopulse_common.zonas import RAIO_INFLUENCIA_M, raio_evitado_na_rota

ARQUIVO_APP = Path(__file__).parents[3] / "mobile/src/domain/zonaInfluencia.ts"


def _raios_do_app() -> dict[str, float]:
    fonte = ARQUIVO_APP.read_text(encoding="utf-8")
    bloco = re.search(r"RAIO_INFLUENCIA_M[^=]*=\s*\{(?P<corpo>[^}]*)\}", fonte)
    assert bloco is not None, f"RAIO_INFLUENCIA_M não encontrado em {ARQUIVO_APP}"
    return {
        chave: float(valor)
        for chave, valor in re.findall(r"(\w+)\s*:\s*([\d_.]+)", bloco.group("corpo"))
    }


def test_app_e_servidor_usam_os_mesmos_raios() -> None:
    assert _raios_do_app() == {s.value: raio for s, raio in RAIO_INFLUENCIA_M.items()}


def test_raio_cresce_com_a_severidade() -> None:
    raios = [RAIO_INFLUENCIA_M[s] for s in Severidade]
    assert raios == sorted(raios)


def test_rota_so_desvia_de_moderado_ou_pior() -> None:
    assert raio_evitado_na_rota(Severidade.BAIXO) == 0
    assert raio_evitado_na_rota(Severidade.CRITICO) == RAIO_INFLUENCIA_M[Severidade.CRITICO]
