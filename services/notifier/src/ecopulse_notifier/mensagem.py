"""Texto e formato da notificação (o mesmo do alerta local do app, em features/alertas)."""

from typing import Any

from ecopulse_common.events import OcorrenciaPayload, Severidade, TipoRisco

# Canal criado pelo app (state/alertas.tsx): importância alta, som e vibração
CANAL_ANDROID = "alertas-risco"

# Iguais aos do app (domain/tipos.ts)
ROTULO_TIPO = {
    TipoRisco.ALAGAMENTO: "Alagamento",
    TipoRisco.CALOR: "Calor",
    TipoRisco.QUALIDADE_AR: "Ar",
    TipoRisco.ROTA_OBSTRUIDA: "Rota obstruída",
}
ROTULO_SEVERIDADE = {
    Severidade.BAIXO: "Baixo",
    Severidade.MODERADO: "Moderado",
    Severidade.ALTO: "Alto",
    Severidade.CRITICO: "Crítico",
}


def formatar_distancia(metros: float) -> str:
    """Igual ao app (lib/distancia.ts): "350 m", "1,2 km", "1 km", "12 km"."""
    valor = max(0.0, metros)
    if valor < 1000:
        return f"{round(valor / 10) * 10} m"
    quilometros = valor / 1000
    if quilometros < 10:
        return f"{quilometros:.1f}".removesuffix(".0").replace(".", ",") + " km"
    return f"{round(quilometros)} km"


def montar(ocorrencia: OcorrenciaPayload, token: str, distancia_m: float) -> dict[str, Any]:
    """`message` do FCM v1. A tag por ocorrência faz uma piora substituir o aviso anterior
    na bandeja, em vez de empilhar; `ocorrenciaId` abre o detalhe no mapa ao tocar."""
    return {
        "token": token,
        "notification": {
            "title": (
                f"{ROTULO_TIPO[ocorrencia.tipo]} · {ROTULO_SEVERIDADE[ocorrencia.severidade]}"
            ),
            "body": formatar_distancia(distancia_m),
        },
        "data": {"ocorrenciaId": str(ocorrencia.id)},
        "android": {
            "priority": "high",
            "ttl": "1800s",
            "notification": {"channel_id": CANAL_ANDROID, "tag": f"ocorrencia-{ocorrencia.id}"},
        },
    }
