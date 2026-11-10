# ADR 0011: Migrações SQL versionadas aplicadas na subida

**Status:** aceito

## Contexto
O esquema estava em um `init.sql` montado no `docker-entrypoint-initdb.d`, que só roda com o volume vazio. Tabelas e colunas novas (resoluções, aparelhos) não chegavam a um banco existente; a única saída documentada era `docker compose down -v`, que apaga os dados.

## Decisão
- Arquivos `infra/postgres/migracoes/NNNN_descricao.sql`, idempotentes, aplicados em ordem pelo serviço `migrate` (script `migrar.sh` com `psql`, cada arquivo numa transação junto com o registro em `schema_migrations`).
- Todos os serviços dependem de `migrate` terminar com sucesso; o CI roda o `migrate` antes dos testes de integração.
- Nunca editar uma migração já aplicada: mudança = arquivo novo.

## Alternativas
- **Alembic / dbmate:** mais recursos, mas uma ferramenta a mais para um esquema pequeno em SQL puro.

## Consequências
- Bancos existentes recebem as mudanças sem perder dados (a 0001 é o antigo `init.sql`, idempotente).
