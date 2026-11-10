-- Versão da ocorrência: incrementa a cada alteração para ordenar eventos entregues fora de ordem.
ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS versao BIGINT NOT NULL DEFAULT 1;
