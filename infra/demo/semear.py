"""Cria ocorrências de demonstração em volta da Av. Paulista pela API (caminho real:
API → RabbitMQ → processor → PostGIS → outbox → eventos).

Uso: uv run python infra/demo/semear.py [--api http://localhost:8000]
"""

import argparse
import json
import math
import random
import time
import urllib.request
import uuid
from datetime import UTC, datetime

# Av. Paulista com Rua Augusta
CENTRO = (-23.5613, -46.6565)

# (tipo, severidade, deslocamento em metros (norte, leste), relatos, notas)
CENARIO = [
    ("alagamento", "critico", (620, 480), 12, ["Rua tomada pela água. Ônibus desviando."]),
    ("alagamento", "alto", (-180, 260), 5, ["Água na altura da calçada."]),
    ("calor", "moderado", (-420, 120), 3, ["Sol forte, sem sombra no ponto de ônibus."]),
    ("qualidade_ar", "alto", (-260, -540), 4, []),
    ("rota_obstruida", "moderado", (330, -300), 2, ["Árvore caída bloqueando uma faixa."]),
    ("alagamento", "baixo", (-900, 700), 1, []),
    ("calor", "critico", (1500, -900), 6, ["Asfalto muito quente, 38 °C."]),
]


def deslocar(lat: float, lon: float, norte_m: float, leste_m: float) -> tuple[float, float]:
    dlat = norte_m / 111_320
    dlon = leste_m / (111_320 * max(0.2, abs(math.cos(math.radians(lat)))))
    return lat + dlat, lon + dlon


def postar(api: str, corpo: dict[str, object]) -> int:
    if not api.startswith(("http://", "https://")):
        raise ValueError(f"URL da API inválida: {api}")
    req = urllib.request.Request(  # noqa: S310 (esquema validado acima)
        f"{api}/v1/relatos",
        json.dumps(corpo).encode(),
        {"content-type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=10) as resposta:  # noqa: S310 (URL local da demo)
        return int(resposta.status)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="http://localhost:8000")
    args = parser.parse_args()
    aleatorio = random.Random(42)  # noqa: S311 (dados de demo)

    total = 0
    for tipo, severidade, (norte, leste), quantidade, notas in CENARIO:
        lat, lon = deslocar(*CENTRO, norte, leste)
        for i in range(quantidade):
            # Espalha até ~60 m: todos caem na mesma ocorrência (raio de agrupamento 300 m)
            jlat, jlon = deslocar(lat, lon, aleatorio.uniform(-60, 60), aleatorio.uniform(-60, 60))
            nota = notas[i] if i < len(notas) else None
            corpo = {
                "client_id": str(uuid.uuid4()),
                "device_id": str(uuid.uuid4()),
                "tipo": tipo,
                "severidade": severidade,
                "descricao": nota,
                "latitude": round(jlat, 6),
                "longitude": round(jlon, 6),
                "registrado_em": datetime.now(UTC).isoformat(),
            }
            postar(args.api, corpo)
            total += 1
            time.sleep(0.05)
        print(f"{tipo:15} {severidade:9} {quantidade:2} relato(s)")
    print(f"{total} relatos enviados em volta de {CENTRO}")


if __name__ == "__main__":
    main()
