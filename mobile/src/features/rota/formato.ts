import type { RotaSegura } from '@/domain/tipos';

/** Segundos → "1 min", "14 min", "1 h", "1 h 5 min". Arredonda para cima; mínimo 1 min. */
export function formatarDuracao(segundos: number): string {
  // TODO(worker)
  throw new Error('não implementado');
}

/** Minutos a mais que a rota direta (arredondado; nunca negativo). 0 sem direta. */
export function minutosExtras(rota: RotaSegura): number {
  // TODO(worker)
  throw new Error('não implementado');
}
