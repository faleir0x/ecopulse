/** Direção por extenso a partir do rumo (8 setores, 0 = norte). */

import { rumoGraus } from '@/lib/distancia';

const SETORES = [
  'norte',
  'nordeste',
  'leste',
  'sudeste',
  'sul',
  'sudoeste',
  'oeste',
  'noroeste',
] as const;

/** Rumo em graus → "norte", "nordeste", ... */
export function direcaoPorExtenso(graus: number): string {
  const normalizado = ((graus % 360) + 360) % 360;
  const indice = Math.round(normalizado / 45) % SETORES.length;
  return SETORES[indice]!;
}

/** Rumo de `de` até `para`, por extenso. */
export function rumoPorExtenso(lat1: number, lon1: number, lat2: number, lon2: number): string {
  return direcaoPorExtenso(rumoGraus(lat1, lon1, lat2, lon2));
}
