import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { migrar } from './outbox';

let banco: SQLiteDatabase | null = null;

export function abrirBanco(): SQLiteDatabase {
  if (banco) {
    return banco;
  }

  const db = openDatabaseSync('ecopulse.db');
  migrar(db);
  banco = db;
  return db;
}
