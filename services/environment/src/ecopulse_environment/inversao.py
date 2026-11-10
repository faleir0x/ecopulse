"""Detecção de inversão térmica a partir de níveis de pressão."""

ALTURA_MINIMA_ACIMA_DO_TERRENO_M = 100.0


def avaliar_inversao(
    temperatura_2m: float | None,
    elevacao_m: float | None,
    niveis: list[tuple[float | None, float | None]],
) -> tuple[bool | None, float | None]:
    """Compara a temperatura a 2 m com a do primeiro nível de pressão acima do terreno.

    Numa inversão o ar logo acima do solo está mais quente que o ar junto ao chão, o que
    estabiliza a atmosfera e prende a poluição; por isso delta > 0 indica inversão.
    """
    if temperatura_2m is None or elevacao_m is None:
        return None, None

    limite = elevacao_m + ALTURA_MINIMA_ACIMA_DO_TERRENO_M
    for temperatura, altura in niveis:
        if temperatura is None or altura is None or altura <= limite:
            continue
        delta = round(temperatura - temperatura_2m, 1)
        return delta > 0, delta
    return None, None
