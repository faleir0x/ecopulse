import Storage from 'expo-sqlite/kv-store';

import type { LocalEscolhido } from '@/features/localizacao';

const CHAVE = 'localizacao.recentes.v1';
const MAX = 3;

function valido(valor: unknown): valor is LocalEscolhido {
  if (!valor || typeof valor !== 'object') return false;
  const local = valor as Partial<LocalEscolhido>;
  return (
    typeof local.latitude === 'number' &&
    Number.isFinite(local.latitude) &&
    typeof local.longitude === 'number' &&
    Number.isFinite(local.longitude) &&
    typeof local.nome === 'string'
  );
}

/** Últimos locais escolhidos (no máximo 3). */
export function lerRecentes(): LocalEscolhido[] {
  try {
    const bruto = Storage.getItemSync(CHAVE);
    if (!bruto) return [];
    const lista = JSON.parse(bruto) as unknown;
    if (!Array.isArray(lista)) return [];
    return lista.filter(valido).slice(0, MAX);
  } catch {
    return [];
  }
}

function salvar(lista: LocalEscolhido[]): void {
  try {
    Storage.setItemSync(CHAVE, JSON.stringify(lista));
  } catch {
    // Sem persistência os recentes valem só nesta sessão
  }
}

/** Põe o local no topo dos recentes (sem repetir) e devolve a lista nova. */
export function acrescentarRecente(local: LocalEscolhido): LocalEscolhido[] {
  const lista = [
    local,
    ...lerRecentes().filter(
      (recente) =>
        recente.nome !== local.nome ||
        recente.latitude !== local.latitude ||
        recente.longitude !== local.longitude,
    ),
  ].slice(0, MAX);
  salvar(lista);
  return lista;
}
