CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS relatos (
    id          BIGSERIAL PRIMARY KEY,
    client_id   UUID NOT NULL UNIQUE,
    tipo        TEXT NOT NULL DEFAULT 'alagamento',
    descricao   TEXT,
    geom        GEOGRAPHY(Point, 4326) NOT NULL,
    geohash     TEXT NOT NULL,
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relatos_geom    ON relatos USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_relatos_geohash ON relatos (geohash);
