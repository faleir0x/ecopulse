import type { CelulaAmbiente } from '@/domain/tipos';
import type { PaletaSeveridade } from '@/theme/tokens';

/**
 * Superfície contínua da camada ambiental: os valores das células geohash5 são interpolados
 * (bilinear entre os centros) numa imagem que o mapa estica sobre a área das células.
 * No calor a escala é relativa ao que está visível (numa cidade a variação é de 1 a 2 °C e
 * a escala fixa de 10 a 36 °C pintava tudo da mesma cor); no ar ela é a fixa do AQI.
 */

export type CamadaSuperficie = 'calor' | 'ar';

export type Superficie = {
  /** data URI do PNG. */
  uri: string;
  /** Para o Overlay: [[lat, lon] do canto nordeste], [[lat, lon] do canto sudoeste]. */
  limites: [[number, number], [number, number]];
  /** Valores (°C ou AQI) das pontas da escala de cores. */
  escala: [number, number];
};

export const PIXELS_POR_CELULA = 12;
/** Amplitude mínima da escala de calor: 23,2 a 23,4 °C não deve parecer frio contra quente. */
export const AMPLITUDE_MINIMA_C = 2;
export const OPACIDADE_SUPERFICIE = 0.45;
export const ESCALA_AQI: [number, number] = [0, 300];

/**
 * [mínimo, máximo] dos valores; se a amplitude for menor que `amplitudeMinima`, abre em volta
 * do centro até ela. Sem valores finitos devolve null.
 */
export function escalaRelativa(
  valores: number[],
  amplitudeMinima: number = AMPLITUDE_MINIMA_C,
): [number, number] | null {
  // TODO(worker)
  throw new Error('não implementado');
}

/** Valor da célula na camada (temperatura ou AQI), null sem leitura. */
export function valorDaCelula(celula: CelulaAmbiente, camada: CamadaSuperficie): number | null {
  // TODO(worker)
  throw new Error('não implementado');
}

/** Cor hexadecimal (#RRGGBB) de um valor na escala da camada. */
export function corDoValor(
  valor: number,
  camada: CamadaSuperficie,
  escala: [number, number],
  sev: PaletaSeveridade,
): string {
  // TODO(worker)
  throw new Error('não implementado');
}

/** Monta a superfície das células com leitura; null quando nenhuma tem valor na camada. */
export function montarSuperficie(
  celulas: CelulaAmbiente[],
  camada: CamadaSuperficie,
  sev: PaletaSeveridade,
): Superficie | null {
  // TODO(worker)
  throw new Error('não implementado');
}
