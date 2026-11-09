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

-- Leituras de clima e qualidade do ar por célula geohash5 (serviço environment)
CREATE TABLE IF NOT EXISTS leituras_ambiente (
    geohash    TEXT NOT NULL,
    medido_em  TIMESTAMPTZ NOT NULL,
    leitura    JSONB NOT NULL,          -- LeituraAmbiente completa
    gravado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (geohash, medido_em)    -- idempotente: a mesma leitura entregue 2x é uma linha só
);

-- "Já passou": cada aparelho marca uma vez; a ocorrência encerra com min(3, confirmações) marcas.
-- ADD COLUMN IF NOT EXISTS: o mesmo arquivo atualiza bancos criados antes desta etapa.
ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS resolucoes   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ocorrencias ADD COLUMN IF NOT EXISTS encerrada_em TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS resolucoes (
    id            BIGSERIAL PRIMARY KEY,
    client_id     UUID NOT NULL UNIQUE,              -- idempotência do reenvio
    device_id     UUID NOT NULL,
    ocorrencia_id BIGINT NOT NULL REFERENCES ocorrencias (id),
    registrado_em TIMESTAMPTZ NOT NULL,
    recebido_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (ocorrencia_id, device_id)                -- um voto por aparelho
);

-- Aparelhos que recebem push remoto (FCM, serviço notifier). Posição arredondada a ~100 m;
-- registros sem renovação há 7 dias deixam de receber e são apagados pelo notifier.
CREATE TABLE IF NOT EXISTS aparelhos (
    id             UUID PRIMARY KEY,                  -- id do aparelho (o mesmo dos relatos)
    token          TEXT NOT NULL UNIQUE,              -- token FCM
    geom           GEOGRAPHY(Point, 4326) NOT NULL,
    raio_m         INTEGER NOT NULL CHECK (raio_m BETWEEN 100 AND 10000),
    limiar         SMALLINT NOT NULL CHECK (limiar BETWEEN 0 AND 3),   -- nível mínimo (baixo=0)
    tipos          TEXT[] NOT NULL,
    silenciado_ate TIMESTAMPTZ,
    atualizado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_aparelhos_geom ON aparelhos USING GIST (geom);
