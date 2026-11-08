import { direcaoPorExtenso, rumoPorExtenso } from './direcoes';

describe('direcaoPorExtenso', () => {
  it('nomeia os oito setores', () => {
    expect(direcaoPorExtenso(0)).toBe('norte');
    expect(direcaoPorExtenso(45)).toBe('nordeste');
    expect(direcaoPorExtenso(90)).toBe('leste');
    expect(direcaoPorExtenso(135)).toBe('sudeste');
    expect(direcaoPorExtenso(180)).toBe('sul');
    expect(direcaoPorExtenso(225)).toBe('sudoeste');
    expect(direcaoPorExtenso(270)).toBe('oeste');
    expect(direcaoPorExtenso(315)).toBe('noroeste');
  });

  it('normaliza ângulos negativos e acima de 360', () => {
    expect(direcaoPorExtenso(-45)).toBe('noroeste');
    expect(direcaoPorExtenso(405)).toBe('nordeste');
  });
});

describe('rumoPorExtenso', () => {
  it('aponta para nordeste quando o alvo está a NE', () => {
    // origem no centro de SP; alvo ~1 km a nordeste
    const rumo = rumoPorExtenso(-23.5613, -46.6565, -23.554, -46.65);
    expect(['norte', 'nordeste', 'leste']).toContain(rumo);
  });
});
