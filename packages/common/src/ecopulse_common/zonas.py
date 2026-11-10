"""Zona de influência de uma ocorrência: área em que ela afeta quem está perto.

Uma regra só para o servidor e o app: o alerta de zona, o círculo no mapa e o desvio da rota
usam estes raios. O app tem a mesma tabela em mobile/src/domain/zonaInfluencia.ts;
packages/common/tests/test_zonas.py falha se as duas divergirem — mude as duas juntas.

Não confundir com o raio de AGRUPAMENTO do processor (300 m): ele decide quais relatos são o
mesmo evento, não até onde o evento afeta.
"""

from ecopulse_common.events import Severidade

RAIO_INFLUENCIA_M: dict[Severidade, float] = {
    Severidade.BAIXO: 150.0,
    Severidade.MODERADO: 300.0,
    Severidade.ALTO: 500.0,
    Severidade.CRITICO: 800.0,
}

# A rota segura desvia só do que atrapalha a passagem: moderado ou pior
SEVERIDADES_EVITADAS_NA_ROTA: frozenset[Severidade] = frozenset(
    {Severidade.MODERADO, Severidade.ALTO, Severidade.CRITICO}
)


def raio_evitado_na_rota(severidade: Severidade) -> float:
    """Raio que a rota segura contorna (0 = não desvia)."""
    return RAIO_INFLUENCIA_M[severidade] if severidade in SEVERIDADES_EVITADAS_NA_ROTA else 0.0
