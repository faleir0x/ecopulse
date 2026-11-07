-- Executado só na criação do volume. Para aplicar mudanças: docker compose down -v
CREATE EXTENSION IF NOT EXISTS postgis;

-- Agrupamento de relatos próximos do mesmo tipo (ver docs/ARQUITETURA.md)
CREATE TABLE IF NOT EXISTS ocorrencias (
    id            BIGSERIAL PRIMARY KEY,
    tipo          TEXT NOT NULL CHECK (tipo IN ('alagamento', 'calor', 'qualidade_ar', 'rota_obstruida')),
    severidade    TEXT NOT NULL CHECK (severidade IN ('baixo', 'moderado', 'alto', 'critico')),
    geom          GEOGRAPHY(Point, 4326) NOT NULL,   -- posição do primeiro relato
    geohash       TEXT NOT NULL,                     -- precisão 6
    confirmacoes  INTEGER NOT NULL DEFAULT 1,
    status        TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'expirada')),
    criada_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_em     TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_geom    ON ocorrencias USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_geohash ON ocorrencias (geohash);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_ativas  ON ocorrencias (expira_em) WHERE status = 'ativa';

-- Cada envio do app, append-only. client_id é a chave de idempotência.
CREATE TABLE IF NOT EXISTS relatos (
    id            BIGSERIAL PRIMARY KEY,
    client_id     UUID NOT NULL UNIQUE,
    device_id     UUID NOT NULL,
    tipo          TEXT NOT NULL,
    severidade    TEXT NOT NULL,
    descricao     TEXT,
    geom          GEOGRAPHY(Point, 4326) NOT NULL,
    geohash       TEXT NOT NULL,
    registrado_em TIMESTAMPTZ NOT NULL,              -- relógio do aparelho
    recebido_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    ocorrencia_id BIGINT REFERENCES ocorrencias (id)
);
CREATE INDEX IF NOT EXISTS idx_relatos_geom       ON relatos USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_relatos_geohash    ON relatos (geohash);
CREATE INDEX IF NOT EXISTS idx_relatos_ocorrencia ON relatos (ocorrencia_id);

-- Transactional outbox: eventos gravados na mesma transação, publicados pelo relay
CREATE TABLE IF NOT EXISTS outbox (
    id           BIGSERIAL PRIMARY KEY,
    event_id     UUID NOT NULL UNIQUE,
    routing_key  TEXT NOT NULL,
    envelope     JSONB NOT NULL,                     -- Envelope completo serializado
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
    publicado_em TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_outbox_pendentes ON outbox (id) WHERE publicado_em IS NULL;
