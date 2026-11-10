import type { CelulaAmbiente } from '@/domain/tipos';
import { corNaEscala } from '@/features/agora/escalas';
import { pngDataUri } from '@/lib/png';
import { escalaTemperatura } from '@/theme/tokens';
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

const CORES_NA_TABELA = 128;
const INICIO_TABELA_AQI = 0;
const FIM_TABELA_AQI = 300;

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

function hexParaRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

/**
 * [mínimo, máximo] dos valores; se a amplitude for menor que `amplitudeMinima`, abre em volta
 * do centro até ela. Sem valores finitos devolve null.
 */
export function escalaRelativa(
  valores: number[],
  amplitudeMinima: number = AMPLITUDE_MINIMA_C,
): [number, number] | null {
  let minimo = Infinity;
  let maximo = -Infinity;
  let quantidade = 0;

  for (const valor of valores) {
    if (!Number.isFinite(valor)) continue;
    minimo = Math.min(minimo, valor);
    maximo = Math.max(maximo, valor);
    quantidade += 1;
  }

  if (quantidade === 0) return null;

  const amplitude = maximo - minimo;
  if (amplitude < amplitudeMinima) {
    const centro = (minimo + maximo) / 2;
    return [centro - amplitudeMinima / 2, centro + amplitudeMinima / 2];
  }

  return [minimo, maximo];
}

/** Valor da célula na camada (temperatura ou AQI), null sem leitura. */
export function valorDaCelula(celula: CelulaAmbiente, camada: CamadaSuperficie): number | null {
  const valor = camada === 'calor' ? celula.temperatura : celula.aqi;
  return valor === null || !Number.isFinite(valor) ? null : valor;
}

/** Cor hexadecimal (#RRGGBB) de um valor na escala da camada. */
export function corDoValor(
  valor: number,
  camada: CamadaSuperficie,
  escala: [number, number],
  sev: PaletaSeveridade,
): string {
  if (camada === 'ar') {
    const paradasAr: readonly (readonly [number, string])[] = [
      [25, sev.fill.baixo],
      [75, sev.fill.moderado],
      [150, sev.fill.alto],
      [250, sev.fill.critico],
    ];
    return corNaEscala(valor, paradasAr);
  }

  const [inicio, fim] = escala;
  const t = fim === inicio ? 0.5 : limitar((valor - inicio) / (fim - inicio), 0, 1);

  const paradas = escalaTemperatura.paradas;
  const primeira = paradas[0]!;
  const ultima = paradas[paradas.length - 1]!;
  const faixa: [number, number] = [primeira[0], ultima[0]];

  return corNaEscala(faixa[0] + t * (faixa[1] - faixa[0]));
}

type CelulaComValor = { celula: CelulaAmbiente; valor: number };

function corDaTabela(
  indice: number,
  tabela: [number, number, number][],
): [number, number, number] {
  return tabela[limitar(indice, 0, tabela.length - 1)]!;
}

const TOLERANCIA_GRADE = 1e-9;
const CELULAS_MAXIMAS_SEM_REDUZIR = 4096;

function arredondarCoordenada(valor: number): number {
  return Math.round(valor / TOLERANCIA_GRADE) * TOLERANCIA_GRADE;
}

/**
 * Menor diferença positiva entre os valores distintos (arredondados a 1e-9). Com amostra
 * regular de células a cada k, é o passo k × largura da célula; null quando só há um valor.
 */
function passoDaGrade(valores: number[]): number | null {
  const distintos = [...new Set(valores.map(arredondarCoordenada))].sort((a, b) => a - b);
  let passo = Infinity;
  for (let indice = 1; indice < distintos.length; indice += 1) {
    const diferenca = arredondarCoordenada(distintos[indice]! - distintos[indice - 1]!);
    if (diferenca > 0) passo = Math.min(passo, diferenca);
  }
  return Number.isFinite(passo) ? passo : null;
}

function centroLat(celula: CelulaAmbiente): number {
  return (celula.lat_min + celula.lat_max) / 2;
}

function centroLon(celula: CelulaAmbiente): number {
  return (celula.lon_min + celula.lon_max) / 2;
}

/** Monta a superfície das células com leitura; null quando nenhuma tem valor na camada. */
export function montarSuperficie(
  celulas: CelulaAmbiente[],
  camada: CamadaSuperficie,
  sev: PaletaSeveridade,
): Superficie | null {
  const comValor: CelulaComValor[] = [];
  for (const celula of celulas) {
    const valor = valorDaCelula(celula, camada);
    if (valor !== null) comValor.push({ celula, valor });
  }

  const primeira = comValor[0];
  if (!primeira) return null;

  const dLatCelula = primeira.celula.lat_max - primeira.celula.lat_min;
  const dLonCelula = primeira.celula.lon_max - primeira.celula.lon_min;
  if (!(dLatCelula > 0) || !(dLonCelula > 0)) return null;

  let latMin = Infinity;
  let latMax = -Infinity;
  let lonMin = Infinity;
  let lonMax = -Infinity;
  let centroLatMin = Infinity;
  let centroLatMax = -Infinity;
  let centroLonMin = Infinity;
  let centroLonMax = -Infinity;
  for (const { celula } of comValor) {
    latMin = Math.min(latMin, celula.lat_min);
    latMax = Math.max(latMax, celula.lat_max);
    lonMin = Math.min(lonMin, celula.lon_min);
    lonMax = Math.max(lonMax, celula.lon_max);
    const lat = centroLat(celula);
    const lon = centroLon(celula);
    centroLatMin = Math.min(centroLatMin, lat);
    centroLatMax = Math.max(centroLatMax, lat);
    centroLonMin = Math.min(centroLonMin, lon);
    centroLonMax = Math.max(centroLonMax, lon);
  }

  // O passo vem dos centros das células com valor: uma amostra regular a cada k células vira
  // uma grade contínua, sem os buracos que existiriam usando o tamanho de uma única célula.
  const dLat = passoDaGrade(comValor.map(({ celula }) => celula.lat_min)) ?? dLatCelula;
  const dLon = passoDaGrade(comValor.map(({ celula }) => celula.lon_min)) ?? dLonCelula;

  const colunas = Math.round((centroLonMax - centroLonMin) / dLon) + 1;
  const linhas = Math.round((centroLatMax - centroLatMin) / dLat) + 1;
  if (colunas < 1 || linhas < 1) return null;

  const grade: (number | undefined)[] = new Array(colunas * linhas);
  for (const { celula, valor } of comValor) {
    const col = Math.round((centroLon(celula) - centroLonMin) / dLon);
    const lin = Math.round((centroLatMax - centroLat(celula)) / dLat);
    if (col < 0 || col >= colunas || lin < 0 || lin >= linhas) continue;
    grade[lin * colunas + col] = valor;
  }

  const escala: [number, number] =
    camada === 'calor'
      ? (escalaRelativa(comValor.map(({ valor }) => valor)) ?? ESCALA_AQI)
      : ESCALA_AQI;

  const inicioTabela = camada === 'ar' ? INICIO_TABELA_AQI : escala[0];
  const fimTabela = camada === 'ar' ? FIM_TABELA_AQI : escala[1];
  const tabela: [number, number, number][] = [];
  for (let indice = 0; indice < CORES_NA_TABELA; indice += 1) {
    const proporcao =
      fimTabela === inicioTabela ? 0 : indice / (CORES_NA_TABELA - 1);
    const valorTabela = inicioTabela + (fimTabela - inicioTabela) * proporcao;
    tabela.push(hexParaRgb(corDoValor(valorTabela, camada, escala, sev)));
  }

  const totalCelulas = colunas * linhas;
  const pixelsPorCelula =
    totalCelulas > CELULAS_MAXIMAS_SEM_REDUZIR
      ? Math.max(
          2,
          Math.floor(
            PIXELS_POR_CELULA * Math.sqrt(CELULAS_MAXIMAS_SEM_REDUZIR / totalCelulas),
          ),
        )
      : PIXELS_POR_CELULA;

  const larguraPx = colunas * pixelsPorCelula;
  const alturaPx = linhas * pixelsPorCelula;
  const rgba = new Uint8Array(larguraPx * alturaPx * 4);
  const alfa = Math.round(OPACIDADE_SUPERFICIE * 255);

  for (let py = 0; py < alturaPx; py += 1) {
    const gy = limitar((py + 0.5) / pixelsPorCelula - 0.5, 0, linhas - 1);
    const j0 = Math.floor(gy);
    const j1 = Math.min(j0 + 1, linhas - 1);
    const fy = gy - j0;

    for (let px = 0; px < larguraPx; px += 1) {
      const gx = limitar((px + 0.5) / pixelsPorCelula - 0.5, 0, colunas - 1);
      const i0 = Math.floor(gx);
      const i1 = Math.min(i0 + 1, colunas - 1);
      const fx = gx - i0;

      const v00 = grade[j0 * colunas + i0];
      const v10 = grade[j0 * colunas + i1];
      const v01 = grade[j1 * colunas + i0];
      const v11 = grade[j1 * colunas + i1];

      let somaPesos = 0;
      let somaValores = 0;

      if (v00 !== undefined) {
        const peso = (1 - fx) * (1 - fy);
        somaPesos += peso;
        somaValores += peso * v00;
      }
      if (v10 !== undefined) {
        const peso = fx * (1 - fy);
        somaPesos += peso;
        somaValores += peso * v10;
      }
      if (v01 !== undefined) {
        const peso = (1 - fx) * fy;
        somaPesos += peso;
        somaValores += peso * v01;
      }
      if (v11 !== undefined) {
        const peso = fx * fy;
        somaPesos += peso;
        somaValores += peso * v11;
      }

      if (somaPesos <= 0) continue;

      const interpolado = somaValores / somaPesos;
      const limitado = limitar(interpolado, inicioTabela, fimTabela);
      const indice =
        fimTabela === inicioTabela
          ? 0
          : Math.round(
              ((limitado - inicioTabela) / (fimTabela - inicioTabela)) *
                (CORES_NA_TABELA - 1),
            );
      const cor = corDaTabela(indice, tabela);
      const destino = (py * larguraPx + px) * 4;
      rgba[destino] = cor[0];
      rgba[destino + 1] = cor[1];
      rgba[destino + 2] = cor[2];
      rgba[destino + 3] = alfa;
    }
  }

  return {
    uri: pngDataUri(larguraPx, alturaPx, rgba),
    limites: [
      [latMax, lonMax],
      [latMin, lonMin],
    ],
    escala,
  };
}
