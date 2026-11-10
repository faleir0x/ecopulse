# ADR 0010: Ordem dos eventos de ocorrência por versão

**Status:** aceito

## Contexto
O relay da outbox roda em várias réplicas do processor e publica lotes em paralelo; a ponte do realtime e o notifier processam várias mensagens ao mesmo tempo. Eventos da mesma ocorrência podem chegar fora de ordem: um `ocorrencia.atualizada` atrasado, depois do `ocorrencia.expirada`, reabria a ocorrência nos celulares.

## Decisão
- Coluna `ocorrencias.versao` (migração 0002), incrementada em todo UPDATE, sob o lock da linha (ordem total por ocorrência). `atualizada_em` não serve: é o `now()` do início da transação, que não acompanha a ordem de gravação.
- O payload `OcorrenciaPayload` leva `versao`. A ponte e o notifier guardam no Redis, por ocorrência e por consumidor, a maior versão vista (`ecopulse_common.ordem`, script Lua atômico, TTL de 7 dias) e descartam versão MENOR. Versão igual passa: é reentrega do mesmo evento, e os consumidores são idempotentes.

## Consequências
- Sem fila única por ocorrência (que limitaria o paralelismo) e sem coordenação entre réplicas além de um GET/SET atômico.
- O app recebe só estados que avançam.
