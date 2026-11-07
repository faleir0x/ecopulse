# Roadmap EcoPulse

Fonte da verdade: **Proposta da APS** (`Proposta_APS_DSD_EcoPulse.docx`). Nenhuma tecnologia pedida nela é trocada.

Cada etapa termina com **commit + push** na branch `caue`.

| Tecnologia da proposta | Escolha |
|---|---|
| Cliente mobile | React Native (TypeScript) + Expo, SQLite local |
| Microsserviços | Python (FastAPI) em Docker |
| Mensageria | RabbitMQ |
| Banco | PostgreSQL + PostGIS |
| Cache / pub-sub | Redis Cluster |
| Particionamento | GeoHash |
| Tempo real | WebSockets + notificações |

## Fase 0: Fundação
- [x] **0.1** Higiene do repositório: codificação UTF-8 sem BOM, `.gitignore`, `.gitattributes`, `.editorconfig`, portas configuráveis, roadmap
- [x] **0.2** Documento de arquitetura + ADRs
- [ ] **0.3** Monorepo: `services/`, `packages/common`, `pyproject` com ruff, mypy e pytest
- [ ] **0.4** Infra: Dockerfiles, compose completo, Redis Cluster, plugin de consistent hash no RabbitMQ, migrações SQL
- [ ] **0.5** CI: lint, tipos, testes, auditoria de dependências, segredos, SAST, scan de imagens, Dependabot

## Fase 1: Caminho de escrita
- [ ] **1.1** `common`: envelope de eventos, topologia RabbitMQ (topic, consistent hash, retry com backoff, DLQ), pool do banco
- [ ] **1.2** `api`: `POST /v1/relatos` com publisher confirms
- [ ] **1.3** `processor`: consumo idempotente, geohash, agrupamento em ocorrências, retry/DLQ

## Fase 2: Caminho de leitura
- [ ] **2.1** Transactional outbox + relay
- [ ] **2.2** Leituras por bbox, detalhe e confirmações, com cache no Redis Cluster e invalidação por evento
- [ ] **2.3** Rate limit por aparelho

## Fase 3: Tempo real
- [ ] **3.1** Serviço `realtime`: WebSocket, assinatura por célula geohash, Redis pub/sub
- [ ] **3.2** Teste de integração com várias instâncias

## Fase 4: Mobile (depende do design)
- [ ] **4.1** Projeto Expo, TypeScript, ESLint, Jest, jobs do mobile na CI
- [ ] **4.2** Tema (tokens light/dark) e componentes base
- [ ] **4.3** Mapa e camadas
- [ ] **4.4** Novo relato + outbox SQLite + sincronização
- [ ] **4.5** Alertas (WebSocket + notificação local), onboarding e ajustes

## Fase 5: Dados ambientais
- [ ] **5.1** Serviço `environment`: Open-Meteo (AQI/temperatura) + simulador para a apresentação

## Fase 6: Entrega
- [ ] **6.1** CD: publicação das imagens no GHCR
- [ ] **6.2** Scripts dos cenários de demonstração (falhas, escala, offline)
- [ ] **6.3** Base do relatório final (estrutura ABNT/UNIP)
