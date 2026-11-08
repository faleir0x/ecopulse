import { randomUUID } from 'expo-crypto';
import Storage from 'expo-sqlite/kv-store';

const CHAVE = 'aparelho.id';

let cache: string | null = null;

export function idAparelho(): string {
  if (cache) {
    return cache;
  }

  const existente = Storage.getItemSync(CHAVE);
  if (existente) {
    cache = existente;
    return existente;
  }

  const id = randomUUID();
  Storage.setItemSync(CHAVE, id);
  cache = id;
  return id;
}
