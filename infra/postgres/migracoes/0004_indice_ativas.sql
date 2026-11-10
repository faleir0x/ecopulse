-- Índice parcial por status: a busca de ocorrência próxima só considera as ativas, sem filtrar o histórico no GiST.
CREATE INDEX IF NOT EXISTS idx_ocorrencias_ativas_geom ON ocorrencias USING GIST (geom) WHERE status = 'ativa';
