# EcoPulse

Plataforma distribuída mobile para monitoramento colaborativo de riscos ambientais urbanos e qualidade do ar. APS de Desenvolvimento de Sistemas Distribuídos, UNIP 2026/2.

## Subir a infraestrutura

```bash
cd infra
cp .env.example .env   # ajuste as portas se alguma já estiver em uso
docker compose up -d --build
./smoke.sh             # confere se tudo subiu integrado
```

| Serviço | Endereço |
|---|---|
| API | http://localhost:8000/docs |
| Painel do RabbitMQ | http://localhost:15672 (`ecopulse` / `ecopulse`) |
| PostgreSQL + PostGIS | localhost:5432 |
| Redis Cluster | localhost:7001, 7002, 7003 |

A rede Docker usa a sub-rede `10.89.70.0/24` (IPs fixos para o Redis Cluster sobreviver a reinícios). O banco é criado pelo `infra/postgres/init.sql` só na primeira vez; para recriar: `docker compose down -v`.

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

Testes de integração (precisam da infra, **sem** a API e o processor rodando, senão o processor consome as mensagens dos testes):

```bash
cd infra && docker compose stop api processor && cd ..
ECOPULSE_DATABASE_URL=postgresql://ecopulse:ecopulse@localhost:5432/ecopulse uv run pytest -m integration
```
