import type { RotaSegura } from '@/domain/tipos';

/** Segundos → "1 min", "14 min", "1 h", "1 h 5 min". Arredonda para cima; mínimo 1 min. */
export function formatarDuracao(segundos: number): string {
  const minutos = Math.max(1, Math.ceil(segundos / 60));
  if (minutos < 60) return `${minutos} min`;

  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `${horas} h` : `${horas} h ${resto} min`;
}

/** Minutos a mais que a rota direta (arredondado; nunca negativo). 0 sem direta. */
export function minutosExtras(rota: RotaSegura): number {
  if (!rota.direta) return 0;
  return Math.max(0, Math.round((rota.duracao_s - rota.direta.duracao_s) / 60));
}
