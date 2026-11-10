import { inflateSync } from 'zlib';

import type { CelulaAmbiente } from '@/domain/tipos';
import { severidade } from '@/theme/tokens';

import {
  corDoValor,
  ESCALA_AQI,
  escalaRelativa,
  PIXELS_POR_CELULA,
  montarSuperficie,
} from './superficie';

type PngDecodificado = { largura: number; altura: number; pixels: Uint8Array };

const SEV = severidade.escuro;
const PI = 'data:image/png;base64,';

function decodificarPng(uri: string): PngDecodificado {
  const bytes = Buffer.from(uri.slice(PI.length), 'base64');
  let largura = 0;
  let altura = 0;
  const partesIdat: Buffer[] = [];
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const tamanho = bytes.readUInt32BE(offset);
    const tipo = bytes.toString('ascii', offset + 4, offset + 8);
    const dados = bytes.subarray(offset + 8, offset + 8 + tamanho);
    if (tipo === 'IHDR') {
      largura = dados.readUInt32BE(0);
      altura = dados.readUInt32BE(4);
    } else if (tipo === 'IDAT') {
      partesIdat.push(dados);
    }
    offset += 12 + tamanho;
  }

  const brutos = inflateSync(Buffer.concat(partesIdat));
  const bytesPorLinha = largura * 4;
  const pixels = new Uint8Array(largura * altura * 4);
  for (let linha = 0; linha < altura; linha += 1) {
    const inicio = linha * (1 + bytesPorLinha);
    pixels.set(
      brutos.subarray(inicio + 1, inicio + 1 + bytesPorLinha),
      linha * bytesPorLinha,
    );
  }

  return { largura, altura, pixels };
}

function pixel(
  png: PngDecodificado,
  x: number,
  y: number,
): [number, number, number, number] {
  const indice = (y * png.largura + x) * 4;
  return [
    png.pixels[indice]!,
    png.pixels[indice + 1]!,
    png.pixels[indice + 2]!,
    png.pixels[indice + 3]!,
  ];
}

function hexParaRgb(hex: string): [number, number, number] {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}

function celula(
  latMin: number,
  lonMin: number,
  temperatura: number | null,
  aqi: number | null = null,
): CelulaAmbiente {
  return {
    geohash: `${latMin}:${lonMin}`,
    lat_min: latMin,
    lon_min: lonMin,
    lat_max: latMin + 0.04,
    lon_max: lonMin + 0.04,
    temperatura,
    aqi,
    medido_em: '2026-11-09T12:00:00Z',
  };
}

describe('escalaRelativa', () => {
  it('devolve null sem valores', () => {
    expect(escalaRelativa([])).toBeNull();
  });

  it('abre em volta do centro quando a amplitude é pequena', () => {
    const escala = escalaRelativa([23.2, 23.4]);

    expect(escala).not.toBeNull();
    expect(escala![0]).toBeCloseTo(22.3);
    expect(escala![1]).toBeCloseTo(24.3);
  });

  it('mantém mínimo e máximo quando a amplitude é grande', () => {
    expect(escalaRelativa([10, 35])).toEqual([10, 35]);
  });

  it('ignora valores não finitos', () => {
    expect(escalaRelativa([Number.NaN, 20, 30, Infinity, -Infinity])).toEqual([20, 30]);
  });
});

describe('corDoValor', () => {
  it('mapeia o calor na paleta inteira', () => {
    expect(corDoValor(23, 'calor', [23, 25], SEV)).toBe('#268BB6');
    expect(corDoValor(25, 'calor', [23, 25], SEV)).toBe('#D33B36');
  });

  it('usa as paradas fixas do AQI para o ar', () => {
    expect(corDoValor(20, 'ar', ESCALA_AQI, SEV)).toBe(SEV.fill.baixo);
    expect(corDoValor(300, 'ar', ESCALA_AQI, SEV)).toBe(SEV.fill.critico);
  });
});

describe('montarSuperficie', () => {
  it('devolve null quando nenhuma célula tem valor na camada', () => {
    expect(montarSuperficie([celula(0, 0, null, 40)], 'calor', SEV)).toBeNull();
    expect(montarSuperficie([], 'ar', SEV)).toBeNull();
  });

  it('monta a grade 2×2 com limites, escala e PNG', () => {
    const celulas = [
      celula(0.04, 0, 21),
      celula(0.04, 0.04, 22),
      celula(0, 0, 20),
      celula(0, 0.04, 23),
    ];

    const superficie = montarSuperficie(celulas, 'calor', SEV);

    expect(superficie).not.toBeNull();
    expect(superficie!.limites).toEqual([
      [0.08, 0.08],
      [0, 0],
    ]);
    expect(superficie!.escala).toEqual([20, 23]);
    expect(superficie!.uri.startsWith('data:image/png;base64,')).toBe(true);

    const png = decodificarPng(superficie!.uri);
    expect(png.largura).toBe(2 * PIXELS_POR_CELULA);
    expect(png.altura).toBe(2 * PIXELS_POR_CELULA);

    const [r, g, b, a] = pixel(png, 0, png.altura - 1);
    expect([r, g, b]).toEqual(hexParaRgb(corDoValor(20, 'calor', superficie!.escala, SEV)));
    expect(a).toBe(Math.round(0.45 * 255));
  });

  it('interpola uma posição vazia da grade em L pelas vizinhas', () => {
    const celulas = [
      celula(0.04, 0, 20),
      celula(0.04, 0.04, 21),
      celula(0, 0, 22),
      // falta a célula sudoeste (0, 0.04)
    ];

    const superficie = montarSuperficie(celulas, 'calor', SEV);
    const png = decodificarPng(superficie!.uri);
    const [, , , alfa] = pixel(png, 17, 17);

    expect(alfa).toBe(Math.round(0.45 * 255));
  });

  it('fecha a grade de uma amostra regular a cada 3 células', () => {
    const celulas: CelulaAmbiente[] = [];
    const valores = [20, 21, 22, 23, 24, 25, 26, 27, 28];
    let indice = 0;
    for (const latMin of [0.24, 0.12, 0]) {
      for (const lonMin of [0, 0.12, 0.24]) {
        celulas.push(celula(latMin, lonMin, valores[indice]!));
        indice += 1;
      }
    }

    const superficie = montarSuperficie(celulas, 'calor', SEV);

    expect(superficie).not.toBeNull();
    expect(superficie!.limites[0][0]).toBeCloseTo(0.28);
    expect(superficie!.limites[0][1]).toBeCloseTo(0.28);
    expect(superficie!.limites[1]).toEqual([0, 0]);

    const png = decodificarPng(superficie!.uri);
    expect(png.largura).toBe(3 * PIXELS_POR_CELULA);
    expect(png.altura).toBe(3 * PIXELS_POR_CELULA);

    const alfas = new Set<number>();
    for (let posicao = 3; posicao < png.pixels.length; posicao += 4) {
      alfas.add(png.pixels[posicao]!);
    }
    expect([...alfas]).toEqual([Math.round(0.45 * 255)]);
  });

  it('fecha a grade entre amostras regulares espaçadas', () => {
    const celulas = [celula(0, 0, 20), celula(0, 0.12, 23)];

    const superficie = montarSuperficie(celulas, 'calor', SEV);
    const png = decodificarPng(superficie!.uri);

    expect(pixel(png, 18, 0)[3]).toBe(Math.round(0.45 * 255));
  });
});
