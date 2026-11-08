/** Utilitários de cor (tokens map.radiusRing usam accent com alfa). */

/** Hex de 6 dígitos → `rgba(r,g,b,alfa)` com alfa em [0, 1]. */
export function comAlfa(hex: string, alfa: number): string {
  const limpo = hex.replace('#', '');
  const r = Number.parseInt(limpo.slice(0, 2), 16);
  const g = Number.parseInt(limpo.slice(2, 4), 16);
  const b = Number.parseInt(limpo.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alfa})`;
}
