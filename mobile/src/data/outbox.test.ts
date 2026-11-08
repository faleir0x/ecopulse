import type { SQLiteDatabase } from 'expo-sqlite';

import type { RelatoEnvio } from '@/api/cliente';

import {
  BACKOFF_BASE_MS,
  BACKOFF_MAX_MS,
  contarPendentes,
  enfileirar,
  marcarEncerrado,
  marcarEnviado,
  marcarRejeitado,
  meusRelatos,
  migrar,
  prontos,
  proximaTentativa,
  registrarFalha,
} from './outbox';

type FakeDb = {
  execSync: jest.Mock;
  getFirstSync: jest.Mock;
  getAllSync: jest.Mock;
  runSync: jest.Mock;
};

function criarDb(): FakeDb {
  return {
    execSync: jest.fn(),
    getFirstSync: jest.fn(),
    getAllSync: jest.fn(),
    runSync: jest.fn(),
  };
}

const relato: RelatoEnvio = {
  client_id: 'cliente-1',
  device_id: 'aparelho-1',
  tipo: 'alagamento',
  severidade: 'alto',
  descricao: 'rua alagada',
  latitude: -23.55,
  longitude: -46.63,
  registrado_em: '2026-01-01T00:00:00Z',
};

const linhaBase = {
  ...relato,
  status: 'pendente',
  tentativas: 0,
  proxima_tentativa_em: null,
  ultimo_erro: null,
  midias: JSON.stringify([{ uri: 'file:///foto.jpg', tipo: 'imagem' }]),
  criado_em: 1000,
  enviado_em: null,
};

describe('outbox', () => {
  it('migra o schema e grava a versão', () => {
    const db = criarDb();
    db.getFirstSync.mockReturnValue({ user_version: 0 });

    migrar(db as unknown as SQLiteDatabase);

    expect(db.execSync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('CREATE TABLE IF NOT EXISTS relatos'),
    );
    expect(db.execSync).toHaveBeenNthCalledWith(2, 'PRAGMA user_version = 1');
  });

  it('não mexe no schema quando já está na versão atual', () => {
    const db = criarDb();
    db.getFirstSync.mockReturnValue({ user_version: 1 });

    migrar(db as unknown as SQLiteDatabase);

    expect(db.execSync).not.toHaveBeenCalled();
  });

  it('enfileira com INSERT OR IGNORE e mídias em JSON', () => {
    const db = criarDb();
    const midias = [{ uri: 'file:///foto.jpg', tipo: 'imagem' as const }];

    enfileirar(db as unknown as SQLiteDatabase, relato, midias, 1234);

    expect(db.runSync).toHaveBeenCalledTimes(1);
    const [sql, parametros] = db.runSync.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT OR IGNORE INTO relatos');
    expect(parametros[0]).toBe('cliente-1');
    expect(parametros[4]).toBe('rua alagada');
    expect(parametros[8]).toBe('pendente');
    expect(parametros[9]).toBe(0);
    expect(parametros[12]).toBe(JSON.stringify(midias));
    expect(parametros[13]).toBe(1234);
    expect(parametros[14]).toBeNull();
  });

  it('lista apenas os pendentes prontos, mais antigos primeiro', () => {
    const db = criarDb();
    db.getAllSync.mockReturnValue([linhaBase, { ...linhaBase, client_id: 'cliente-2' }]);

    const lista = prontos(db as unknown as SQLiteDatabase, 5000);

    const [sql, parametros] = db.getAllSync.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain("status = 'pendente'");
    expect(sql).toContain('proxima_tentativa_em IS NULL OR proxima_tentativa_em <= ?');
    expect(sql).toContain('ORDER BY criado_em ASC');
    expect(parametros).toEqual([5000]);
    expect(lista).toHaveLength(2);
    expect(lista[0]?.midias).toEqual([{ uri: 'file:///foto.jpg', tipo: 'imagem' }]);
  });

  it('conta pendentes', () => {
    const db = criarDb();
    db.getFirstSync.mockReturnValue({ total: 4 });

    expect(contarPendentes(db as unknown as SQLiteDatabase)).toBe(4);
    expect(db.getFirstSync).toHaveBeenCalledWith(
      expect.stringContaining("WHERE status = 'pendente'"),
    );
  });

  it('marca enviado, rejeitado e encerrado', () => {
    const db = criarDb();
    const banco = db as unknown as SQLiteDatabase;

    marcarEnviado(banco, 'cliente-1', 9000);
    marcarRejeitado(banco, 'cliente-2', 'inválido');
    marcarEncerrado(banco, 'cliente-3');

    const chamadas = db.runSync.mock.calls as [string, unknown[]][];
    expect(chamadas[0]?.[0]).toContain("status = 'enviado'");
    expect(chamadas[0]?.[1]).toEqual([9000, 'cliente-1']);
    expect(chamadas[1]?.[0]).toContain("status = 'rejeitado'");
    expect(chamadas[1]?.[1]).toEqual(['inválido', 'cliente-2']);
    expect(chamadas[2]?.[0]).toContain("status = 'encerrado'");
    expect(chamadas[2]?.[1]).toEqual(['cliente-3']);
  });

  it('lista meus relatos do mais recente para o mais antigo', () => {
    const db = criarDb();
    db.getAllSync.mockReturnValue([linhaBase]);

    const lista = meusRelatos(db as unknown as SQLiteDatabase);

    expect(db.getAllSync).toHaveBeenCalledWith(
      expect.stringContaining('ORDER BY criado_em DESC'),
    );
    expect(lista[0]?.client_id).toBe('cliente-1');
  });

  describe('proximaTentativa', () => {
    it('usa retryAfter do servidor sem jitter', () => {
      expect(proximaTentativa(5, 1000, 30, () => 0)).toBe(31_000);
    });

    it('faz backoff exponencial com jitter neutro em 0,5', () => {
      expect(proximaTentativa(0, 1000, null, () => 0.5)).toBe(1000 + BACKOFF_BASE_MS);
      expect(proximaTentativa(1, 1000, null, () => 0.5)).toBe(1000 + BACKOFF_BASE_MS * 2);
      expect(proximaTentativa(2, 1000, null, () => 0.5)).toBe(1000 + BACKOFF_BASE_MS * 4);
    });

    it('aplica ±20% de jitter', () => {
      expect(proximaTentativa(0, 0, null, () => 0)).toBe(Math.round(BACKOFF_BASE_MS * 0.8));
      expect(proximaTentativa(0, 0, null, () => 1)).toBe(Math.round(BACKOFF_BASE_MS * 1.2));
    });

    it('limita o backoff ao máximo', () => {
      expect(proximaTentativa(50, 1000, null, () => 0.5)).toBe(1000 + BACKOFF_MAX_MS);
    });
  });

  it('registra falha incrementando tentativas e agendando a próxima', () => {
    const db = criarDb();
    db.getFirstSync.mockReturnValue({ tentativas: 1 });

    registrarFalha(
      db as unknown as SQLiteDatabase,
      'cliente-1',
      'falhou',
      1000,
      null,
      () => 0.5,
    );

    expect(db.getFirstSync).toHaveBeenCalledWith(
      expect.stringContaining('SELECT tentativas FROM relatos'),
      ['cliente-1'],
    );
    const [sql, parametros] = db.runSync.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('tentativas = tentativas + 1');
    expect(parametros).toEqual([1000 + BACKOFF_BASE_MS * 2, 'falhou', 'cliente-1']);
  });
});
