# ADR 0001: Arquitetura orientada a eventos com 4 microsserviços

**Status:** aceito

## Contexto
A proposta (seção III) exige EDA com microsserviços. Os serviços precisam escalar por motivos diferentes, mas a equipe é pequena e tudo roda em um laptop.

## Decisão
Quatro serviços em Python/FastAPI: `api`, `processor`, `realtime` e `environment`. Código comum em `packages/common`. Comunicação entre serviços apenas por eventos, nunca HTTP direto.

## Consequências
- Cada serviço tem um motivo próprio de escala (requisições, processamento, conexões, coleta).
- Mais serviços que isso aumentaria o custo operacional sem ganho na demonstração.
- A consistência entre serviços é eventual.
