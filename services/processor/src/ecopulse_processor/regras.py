"""Regras de negócio do agrupamento (valores fixos, decididos na arquitetura)."""

from datetime import timedelta

from ecopulse_common.events import Severidade, TipoRisco

# Relatos do mesmo tipo a até esta distância entram na mesma ocorrência ativa
RAIO_AGRUPAMENTO_M = 300

# Quanto tempo uma ocorrência fica ativa sem novas confirmações
VALIDADE: dict[TipoRisco, timedelta] = {
    TipoRisco.ALAGAMENTO: timedelta(hours=3),
    TipoRisco.CALOR: timedelta(hours=6),
    TipoRisco.QUALIDADE_AR: timedelta(hours=6),
    TipoRisco.ROTA_OBSTRUIDA: timedelta(hours=2),
}

# Ordem crescente; a ocorrência assume a maior severidade relatada
ORDEM_SEVERIDADE: tuple[Severidade, ...] = (
    Severidade.BAIXO,
    Severidade.MODERADO,
    Severidade.ALTO,
    Severidade.CRITICO,
)

# "Já passou": no máximo esta quantidade de marcações encerra a ocorrência
RESOLUCOES_MAXIMAS = 3


def resolucoes_para_encerrar(confirmacoes: int) -> int:
    """Marcações necessárias para encerrar: min(RESOLUCOES_MAXIMAS, confirmações), ao menos 1."""
    return max(1, min(RESOLUCOES_MAXIMAS, confirmacoes))


INTERVALO_EXPIRACAO_S = 60
