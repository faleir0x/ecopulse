/**
 * Ícones Solar gerados por scripts/gerar-icones.mjs em ./solar/icones.ts (não edite à mão).
 * Peso: linear em repouso, bold no ativo, bold-duotone para clima.
 */
export type PesoIcone = 'linear' | 'bold' | 'bold-duotone';

/** Nomes base usados no app (sem o sufixo de peso). A lista é a fonte para o gerador. */
export const ICONES = [
  // abas
  'home-angle-2', 'map', 'bell', 'settings-minimalistic',
  // tipos de risco (rota obstruída: placa de desvio)
  'cloud-waterdrops', 'temperature', 'wind', 'route',
  // clima
  'sun-2', 'cloud-sun-2', 'clouds', 'cloud-rain', 'moon',
  // interface
  'play', 'history', 'gallery-minimalistic', 'add', 'alt-arrow-down', 'alt-arrow-left',
  'alt-arrow-right', 'arrow-up', 'bell-off', 'camera-minimalistic', 'check-circle', 'close',
  'cloud-check', 'cloud-cross', 'gps', 'layers-minimalistic', 'map-point', 'pen', 'refresh',
  // rota segura
  'routing-2', 'flag', 'walking', 'car', 'danger-triangle',
  // busca de local
  'magnifer',
] as const;

export type NomeIcone = (typeof ICONES)[number];

/** Combinações nome + peso que o gerador precisa emitir além de todos os "linear". */
export const VARIANTES_EXTRAS: readonly `${NomeIcone}-${Exclude<PesoIcone, 'linear'>}`[] = [
  'home-angle-2-bold', 'map-bold', 'bell-bold', 'settings-minimalistic-bold',
  'cloud-waterdrops-bold', 'temperature-bold', 'wind-bold', 'route-bold', 'map-point-bold', 'play-bold',
  'sun-2-bold-duotone', 'cloud-sun-2-bold-duotone', 'clouds-bold-duotone', 'cloud-rain-bold-duotone',
  'moon-bold-duotone',
];
