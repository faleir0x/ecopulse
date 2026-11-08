import { escalaTemperatura, faixasAqi } from '@/theme/tokens';

import {
  corNaEscala,
  gradienteTemperatura,
  interpolarOkLab,
  nivelAqi,
  nivelArMedido,
  nivelCalorMedido,
} from './escalas';

describe('escalas de temperatura (OKLab)', () => {
  it('devolve a parada exata nos extremos', () => {
    expect(corNaEscala(10)).toBe('#268BB6');
    expect(corNaEscala(37)).toBe('#D33B36');
    expect(corNaEscala(27)).toBe('#E1AD57');
    expect(corNaEscala(-5)).toBe('#268BB6');
    expect(corNaEscala(50)).toBe('#D33B36');
  });

  it('interpola entre duas paradas', () => {
    const meio = corNaEscala((escalaTemperatura.paradas[0]![0] + escalaTemperatura.paradas[1]![0]) / 2);
    expect(meio).not.toBe('#268BB6');
    expect(meio).not.toBe('#6AB0CA');
    expect(meio).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('devolve os extremos intactos na interpolação', () => {
    expect(interpolarOkLab('#268BB6', '#6AB0CA', 0)).toBe('#268BB6');
    expect(interpolarOkLab('#268BB6', '#6AB0CA', 1)).toBe('#6AB0CA');
  });

  it('monta o gradiente com posições normalizadas', () => {
    const { cores, posicoes } = gradienteTemperatura(escalaTemperatura.faixa[0], escalaTemperatura.faixa[1]);
    expect(cores.length).toBeGreaterThanOrEqual(2);
    expect(cores[0]).toBe('#268BB6');
    expect(cores[cores.length - 1]).toBe(corNaEscala(escalaTemperatura.faixa[1]));
    expect(posicoes[0]).toBe(0);
    expect(posicoes[posicoes.length - 1]).toBe(1);
  });
});

describe('nível do AQI pelas faixas', () => {
  it.each([
    [0, 'baixo'],
    [50, 'baixo'],
    [51, 'moderado'],
    [100, 'moderado'],
    [101, 'alto'],
    [200, 'alto'],
    [201, 'critico'],
    [faixasAqi.critico[1], 'critico'],
  ] as const)('%i → %s', (aqi, esperado) => {
    expect(nivelAqi(aqi)).toBe(esperado);
  });

  it('devolve null sem leitura', () => {
    expect(nivelAqi(null)).toBeNull();
    expect(nivelAqi(undefined)).toBeNull();
  });
});

describe('níveis medidos', () => {
  it('ar: AQI bom não conta como risco', () => {
    expect(nivelArMedido(40)).toBeNull();
    expect(nivelArMedido(75)).toBe('moderado');
    expect(nivelArMedido(153)).toBe('alto');
    expect(nivelArMedido(null)).toBeNull();
  });

  it('calor: faixas da sensação térmica', () => {
    expect(nivelCalorMedido(31.9)).toBeNull();
    expect(nivelCalorMedido(32)).toBe('moderado');
    expect(nivelCalorMedido(37)).toBe('alto');
    expect(nivelCalorMedido(41)).toBe('critico');
    expect(nivelCalorMedido(undefined)).toBeNull();
  });
});
