# EcoPulse

Plataforma distribuída mobile para monitoramento colaborativo de riscos ambientais urbanos e qualidade do ar. APS de Desenvolvimento de Sistemas Distribuídos, UNIP 2026/2.

## Subir a infraestrutura

```bash
cd infra
cp .env.example .env   # ajuste as portas se alguma já estiver em uso
docker compose up -d
```

Painel do RabbitMQ: http://localhost:15672 (`ecopulse` / `ecopulse`).

## Documentação

- [Roadmap](docs/ROADMAP.md)
- [Arquitetura](docs/ARQUITETURA.md)
- [Decisões (ADRs)](docs/adr/)

## Desenvolvimento (backend)

Requer [uv](https://docs.astral.sh/uv/).

```bash
uv sync --all-packages      # cria .venv com todos os serviços
uv run ruff check .         # lint
uv run mypy packages services
uv run pytest
```
