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
| WebSocket de alertas (realtime) | ws://localhost:8002/v1/ws |
| Painel do RabbitMQ | http://localhost:15672 (`ecopulse` / `ecopulse`) |
| PostgreSQL + PostGIS | localhost:5432 |
| Redis Cluster | localhost:7001 a 7006 |

API e realtime ficam acessíveis na rede local (o celular usa). PostgreSQL, RabbitMQ e Redis só no `127.0.0.1` do laptop: as credenciais acima são de desenvolvimento e não devem ficar expostas na rede.

A rede Docker usa a sub-rede `10.89.70.0/24` (IPs fixos para o Redis Cluster sobreviver a reinícios). O esquema do banco vem das migrações em `infra/postgres/migracoes/`, aplicadas em ordem pelo serviço `migrate` a cada `docker compose up` (só as que faltam, registradas em `schema_migrations`). Mudança de esquema = novo arquivo `NNNN_descricao.sql`; nunca edite uma migração já aplicada.

## Documentação

- [Roadmap](docs/ROADMAP.md)
- [Arquitetura](docs/ARQUITETURA.md)
- [Decisões (ADRs)](docs/adr/)
- [Política de segurança da CI](docs/SEGURANCA.md)

## Desenvolvimento (backend)

Requer [uv](https://docs.astral.sh/uv/).

```bash
uv sync --all-packages      # cria .venv com todos os serviços
uv run ruff check .         # lint
uv run mypy packages services
uv run pytest
```

Testes de integração (precisam da infra, **sem** a API e o processor rodando, senão o processor consome as mensagens dos testes). Eles **apagam as tabelas** do banco usado; para não perder os dados de demonstração, rode-os num banco separado:

```bash
cd infra
docker compose exec postgres createdb -U ecopulse ecopulse_teste   # só na primeira vez
docker compose run --rm -e PGDATABASE=ecopulse_teste migrate
docker compose stop api processor && cd ..
ECOPULSE_DATABASE_URL=postgresql://ecopulse:ecopulse@localhost:5432/ecopulse_teste \
ECOPULSE_REDIS_REMAP_LOCALHOST=true uv run pytest -m integration
```

## App mobile (React Native + Expo)

Requer Node 24+ e o app **Expo Go** no celular (Android), na mesma rede Wi-Fi do laptop.

```bash
cd mobile
npm ci
cp .env.example .env.local   # ajuste as portas se mudou no infra/.env
npx expo start               # leia o QR code com o Expo Go
```

Verificações: `npm run check` (TypeScript, ESLint e Jest).

## Dados de demonstração

Cria ocorrências em volta da Av. Paulista pelo caminho real (API → fila → processor):

```bash
uv run python infra/demo/semear.py --api http://localhost:8000
```

No app, `EXPO_PUBLIC_LOCALIZACAO_SIMULADA=-23.5480,-46.6440` no `mobile/.env.local` fixa a posição lá (fora das zonas de risco). Com a posição simulada, "Seguir rota" faz o usuário andar pela rota segura (`EXPO_PUBLIC_VELOCIDADE_SIMULADA`, padrão 15 m/s). As ocorrências expiram sozinhas (alagamento em 3 h, calor em 6 h).
