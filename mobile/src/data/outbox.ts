/**
 * Outbox local (SQLite) dos relatos — ADR 0004, lado do app.
 * O relato é gravado ANTES de qualquer envio e só sai do estado "pendente" depois do 202.
 * A mesma tabela alimenta "Meus relatos".
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import type { RelatoEnvio } from '@/api/cliente';

export type StatusRelato = 'pendente' | 'enviado' | 'rejeitado' | 'encerrado';

export type MidiaLocal = { uri: string; tipo: 'imagem' | 'video' };

export type RelatoLocal = RelatoEnvio & {
  status: StatusRelato;
  tentativas: number;
  /** epoch ms; null = pode tentar já */
  proxima_tentativa_em: number | null;
  ultimo_erro: string | null;
  /** Mídia fica só no aparelho (sem upload: decisão do dono, ver HANDOFF §12) */
  midias: MidiaLocal[];
  criado_em: number;
  enviado_em: number | null;
};

export const BACKOFF_BASE_MS = 2_000;
export const BACKOFF_MAX_MS = 5 * 60_000;

const VERSAO_SCHEMA = 1;

type LinhaRelato = {
  client_id: string;
  device_id: string;
  tipo: string;
  severidade: string;
  descricao: string | null;
  latitude: number;
  longitude: number;
  registrado_em: string;
  status: string;
  tentativas: number;
  proxima_tentativa_em: number | null;
  ultimo_erro: string | null;
  midias: string;
  criado_em: number;
  enviado_em: number | null;
};

function paraRelatoLocal(linha: LinhaRelato): RelatoLocal {
  let midias: MidiaLocal[] = [];
  try {
    const valor = JSON.parse(linha.midias || '[]') as unknown;
    if (Array.isArray(valor)) {
      midias = valor as MidiaLocal[];
    }
  } catch {
    midias = [];
  }

  return {
    client_id: linha.client_id,
    device_id: linha.device_id,
    tipo: linha.tipo as RelatoLocal['tipo'],
    severidade: linha.severidade as RelatoLocal['severidade'],
    descricao: linha.descricao ?? null,
    latitude: linha.latitude,
    longitude: linha.longitude,
    registrado_em: linha.registrado_em,
    status: linha.status as StatusRelato,
    tentativas: linha.tentativas,
    proxima_tentativa_em: linha.proxima_tentativa_em,
    ultimo_erro: linha.ultimo_erro,
    midias,
    criado_em: linha.criado_em,
    enviado_em: linha.enviado_em,
  };
}

/** Cria/migra o schema com PRAGMA user_version. Idempotente. */
export function migrar(db: SQLiteDatabase): void {
  const linha = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const versao = linha?.user_version ?? 0;
  if (versao >= VERSAO_SCHEMA) {
    return;
  }

  db.execSync(`
    CREATE TABLE IF NOT EXISTS relatos (
      client_id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      tipo TEXT NOT NULL,
      severidade TEXT NOT NULL,
      descricao TEXT,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      registrado_em TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pendente',
      tentativas INTEGER NOT NULL DEFAULT 0,
      proxima_tentativa_em INTEGER,
      ultimo_erro TEXT,
      midias TEXT NOT NULL DEFAULT '[]',
      criado_em INTEGER NOT NULL,
      enviado_em INTEGER
    );
  `);
  db.execSync(`PRAGMA user_version = ${VERSAO_SCHEMA}`);
}

export function enfileirar(db: SQLiteDatabase, relato: RelatoEnvio, midias: MidiaLocal[], agora: number): void {
  db.runSync(
    `INSERT OR IGNORE INTO relatos (
      client_id, device_id, tipo, severidade, descricao, latitude, longitude, registrado_em,
      status, tentativas, proxima_tentativa_em, ultimo_erro, midias, criado_em, enviado_em
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      relato.client_id,
      relato.device_id,
      relato.tipo,
      relato.severidade,
      relato.descricao ?? null,
      relato.latitude,
      relato.longitude,
      relato.registrado_em,
      'pendente',
      0,
      null,
      null,
      JSON.stringify(midias),
      agora,
      null,
    ],
  );
}

/** Pendentes prontos para envio (proxima_tentativa_em nula ou <= agora), mais antigos primeiro. */
export function prontos(db: SQLiteDatabase, agora: number): RelatoLocal[] {
  const linhas = db.getAllSync<LinhaRelato>(
    `SELECT * FROM relatos
     WHERE status = 'pendente'
       AND (proxima_tentativa_em IS NULL OR proxima_tentativa_em <= ?)
     ORDER BY criado_em ASC, rowid ASC`,
    [agora],
  );
  return linhas.map(paraRelatoLocal);
}

export function contarPendentes(db: SQLiteDatabase): number {
  const linha = db.getFirstSync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM relatos WHERE status = 'pendente'`,
  );
  return Number(linha?.total ?? 0);
}

export function marcarEnviado(db: SQLiteDatabase, clientId: string, agora: number): void {
  db.runSync(
    `UPDATE relatos
     SET status = 'enviado', enviado_em = ?, proxima_tentativa_em = NULL, ultimo_erro = NULL
     WHERE client_id = ?`,
    [agora, clientId],
  );
}

/** Erro definitivo (4xx de validação): sai da fila, fica visível em Meus relatos. */
export function marcarRejeitado(db: SQLiteDatabase, clientId: string, erro: string): void {
  db.runSync(
    `UPDATE relatos
     SET status = 'rejeitado', ultimo_erro = ?, proxima_tentativa_em = NULL
     WHERE client_id = ?`,
    [erro, clientId],
  );
}

/** "Já passou" no próprio relato. */
export function marcarEncerrado(db: SQLiteDatabase, clientId: string): void {
  db.runSync(`UPDATE relatos SET status = 'encerrado' WHERE client_id = ?`, [clientId]);
}

/**
 * Agenda a próxima tentativa: se retryAfterS vier do servidor, usa ele; senão backoff
 * exponencial BACKOFF_BASE_MS * 2^tentativas limitado a BACKOFF_MAX_MS, com jitter de ±20%
 * (função `aleatorio` injetável para teste). Incrementa tentativas.
 */
export function proximaTentativa(
  tentativas: number,
  agora: number,
  retryAfterS: number | null,
  aleatorio: () => number,
): number {
  if (retryAfterS != null) {
    return agora + retryAfterS * 1000;
  }

  const base = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, tentativas), BACKOFF_MAX_MS);
  const fator = 0.8 + aleatorio() * 0.4;
  return agora + Math.round(base * fator);
}

export function registrarFalha(
  db: SQLiteDatabase,
  clientId: string,
  erro: string,
  agora: number,
  retryAfterS: number | null,
  aleatorio: () => number = Math.random,
): void {
  const linha = db.getFirstSync<{ tentativas: number }>(
    `SELECT tentativas FROM relatos WHERE client_id = ?`,
    [clientId],
  );
  const tentativas = linha?.tentativas ?? 0;
  const proxima = proximaTentativa(tentativas, agora, retryAfterS, aleatorio);

  db.runSync(
    `UPDATE relatos
     SET tentativas = tentativas + 1, proxima_tentativa_em = ?, ultimo_erro = ?
     WHERE client_id = ?`,
    [proxima, erro, clientId],
  );
}

/** Todos os relatos do aparelho, mais recentes primeiro. */
export function meusRelatos(db: SQLiteDatabase): RelatoLocal[] {
  const linhas = db.getAllSync<LinhaRelato>(
    `SELECT * FROM relatos ORDER BY criado_em DESC, rowid DESC`,
  );
  return linhas.map(paraRelatoLocal);
}
