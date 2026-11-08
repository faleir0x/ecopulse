/** Escalas de dado da aba Agora: temperatura em OKLab, AQI e bbox do raio. */
import type { Severidade } from '@/domain/tipos';
import type { Coordenada } from '@/features/localizacao';
import type { Bbox } from '@/lib/geohash';
import { escalaTemperatura, faixasAqi } from '@/theme/tokens';

type Parada = readonly [number, string];
type Rgb = readonly [number, number, number];
type Oklab = readonly [number, number, number];

function limitar(valor: number, minimo: number, maximo: number): number {
  return Math.min(maximo, Math.max(minimo, valor));
}

function hexParaRgb(hex: string): Rgb {
  const limpo = hex.replace('#', '');
  return [
    Number.parseInt(limpo.slice(0, 2), 16),
    Number.parseInt(limpo.slice(2, 4), 16),
    Number.parseInt(limpo.slice(4, 6), 16),
  ];
}

function canalParaLinear(canal: number): number {
  const valor = canal / 255;
  return valor <= 0.04045 ? valor / 12.92 : ((valor + 0.055) / 1.055) ** 2.4;
}

function linearParaCanal(valor: number): number {
  const canal =
    valor <= 0.0031308 ? valor * 12.92 : 1.055 * valor ** (1 / 2.4) - 0.055;
  return Math.round(limitar(canal, 0, 1) * 255);
}

function rgbParaHex([r, g, b]: Rgb): string {
  const paraHex = (canal: number) => canal.toString(16).padStart(2, '0').toUpperCase();
  return `#${paraHex(r)}${paraHex(g)}${paraHex(b)}`;
}

function rgbParaOklab(rgb: Rgb): Oklab {
  const r = canalParaLinear(rgb[0]);
  const g = canalParaLinear(rgb[1]);
  const b = canalParaLinear(rgb[2]);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function oklabParaRgb([L, a, b]: Oklab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  return [
    linearParaCanal(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    linearParaCanal(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    linearParaCanal(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

/** Interpola duas cores hexadecimais em OKLab (gama sRGB ao final). */
export function interpolarOkLab(corA: string, corB: string, t: number): string {
  const proporcao = limitar(t, 0, 1);
  if (proporcao <= 0) return corA;
  if (proporcao >= 1) return corB;

  const a = rgbParaOklab(hexParaRgb(corA));
  const b = rgbParaOklab(hexParaRgb(corB));
  const misturada: Oklab = [
    a[0] + (b[0] - a[0]) * proporcao,
    a[1] + (b[1] - a[1]) * proporcao,
    a[2] + (b[2] - a[2]) * proporcao,
  ];

  return rgbParaHex(oklabParaRgb(misturada));
}

/** Cor da escala de temperatura para um valor (extremos devolvem a parada exata). */
export function corNaEscala(
  valor: number,
  paradas: readonly Parada[] = escalaTemperatura.paradas,
): string {
  const primeira = paradas[0];
  const ultima = paradas[paradas.length - 1];
  if (!primeira || !ultima) throw new Error('escala de temperatura vazia');
  if (!Number.isFinite(valor) || valor <= primeira[0]) return primeira[1];
  if (valor >= ultima[0]) return ultima[1];

  for (let indice = 0; indice < paradas.length - 1; indice += 1) {
    const inicio = paradas[indice];
    const fim = paradas[indice + 1];
    if (!inicio || !fim) continue;
    if (valor === inicio[0]) return inicio[1];
    if (valor > inicio[0] && valor < fim[0]) {
      const proporcao = (valor - inicio[0]) / (fim[0] - inicio[0]);
      return interpolarOkLab(inicio[1], fim[1], proporcao);
    }
  }

  return ultima[1];
}

/**
 * Paradas do gradiente de temperatura entre dois valores, já interpoladas em OKLab.
 * As posições são normalizadas em [0, 1] para o LinearGradient.
 */
export function gradienteTemperatura(
  minimo: number,
  maximo: number,
): { cores: string[]; posicoes: number[] } {
  let inicio = minimo;
  let fim = maximo;
  if (!Number.isFinite(inicio) || !Number.isFinite(fim)) {
    inicio = escalaTemperatura.faixa[0];
    fim = escalaTemperatura.faixa[1];
  }
  if (inicio > fim) [inicio, fim] = [fim, inicio];
  if (inicio === fim) fim = inicio + 0.001;

  const valores = [
    inicio,
    ...escalaTemperatura.paradas
      .map(([valor]) => valor)
      .filter((valor) => valor > inicio && valor < fim),
    fim,
  ];

  return {
    cores: valores.map((valor) => corNaEscala(valor)),
    posicoes: valores.map((valor) => (valor - inicio) / (fim - inicio)),
  };
}

/** Nível de AQI pelas faixas do token (null quando não há leitura). */
export function nivelAqi(aqi: number | null | undefined): Severidade | null {
  if (aqi === null || aqi === undefined || !Number.isFinite(aqi)) return null;
  if (aqi <= faixasAqi.baixo[1]) return 'baixo';
  if (aqi <= faixasAqi.moderado[1]) return 'moderado';
  if (aqi <= faixasAqi.alto[1]) return 'alto';
  return 'critico';
}

/** Posição [0, 1] de um valor dentro de uma faixa, com clamp nas pontas. */
export function posicaoNaFaixa(valor: number, faixa: readonly [number, number]): number {
  const [minimo, maximo] = faixa;
  if (maximo === minimo) return 0;
  return limitar((valor - minimo) / (maximo - minimo), 0, 1);
}

/** Bbox quadrada que cobre o raio em metros ao redor da origem. */
export function bboxDoRaio(origem: Coordenada, raioM: number): Bbox {
  const metrosPorGrauLat = 111_320;
  const deltaLat = raioM / metrosPorGrauLat;
  const cosseno = Math.cos((origem.latitude * Math.PI) / 180);
  const deltaLon = raioM / (metrosPorGrauLat * Math.max(Math.abs(cosseno), 1e-6));
  return {
    latMin: origem.latitude - deltaLat,
    latMax: origem.latitude + deltaLat,
    lonMin: origem.longitude - deltaLon,
    lonMax: origem.longitude + deltaLon,
  };
}

/** Ar medido como risco: o AQI "baixo" (bom) não conta; moderado em diante, sim. */
export function nivelArMedido(aqi: number | null | undefined): Severidade | null {
  const nivel = nivelAqi(aqi);
  return nivel === 'baixo' ? null : nivel;
}

/** Calor medido pela sensação térmica (faixas do índice de calor): < 32 °C não conta. */
export function nivelCalorMedido(sensacao: number | null | undefined): Severidade | null {
  if (sensacao === null || sensacao === undefined || !Number.isFinite(sensacao)) return null;
  if (sensacao >= 41) return 'critico';
  if (sensacao >= 37) return 'alto';
  if (sensacao >= 32) return 'moderado';
  return null;
}

/** Vento abaixo disso não dispersa a poluição (ar parado). */
export const VENTO_FRACO_KMH = 10;

/** Umidade baixa como alerta (faixas da Defesa Civil): < 30% atenção, < 20% alerta, < 12% emergência. */
export function nivelUmidade(umidade: number | null | undefined): Severidade | null {
  if (umidade === null || umidade === undefined || !Number.isFinite(umidade)) return null;
  if (umidade < 12) return 'critico';
  if (umidade < 20) return 'alto';
  if (umidade < 30) return 'moderado';
  return null;
}

/** Nome curto do poluente principal do AQI. */
export const ROTULO_POLUENTE: Record<string, string> = {
  pm2_5: 'PM2.5',
  pm10: 'PM10',
  ozonio: 'Ozônio',
  no2: 'NO₂',
  so2: 'SO₂',
  co: 'CO',
};

/** Chance de chuva a partir da qual a hora mostra o percentual. */
export const PROB_CHUVA_MINIMA = 20;
