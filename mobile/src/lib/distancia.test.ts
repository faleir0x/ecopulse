import { direcao, distanciaM, formatarDistancia, rumoGraus } from './distancia';

describe('distancia', () => {
  it('calcula a distância entre a Paulista e a Sé', () => {
    const metros = distanciaM(-23.5613, -46.6565, -23.5503, -46.634);
    expect(metros / 1000).toBeGreaterThan(2.5);
    expect(metros / 1000).toBeLessThan(2.7);
  });

  it('calcula o rumo inicial', () => {
    expect(rumoGraus(0, 0, 1, 0)).toBeCloseTo(0, 6);
    expect(rumoGraus(0, 0, 0, 1)).toBeCloseTo(90, 6);
    expect(rumoGraus(1, 0, 0, 0)).toBeCloseTo(180, 6);
    expect(rumoGraus(0, 0, 0, -1)).toBeCloseTo(270, 6);
  });

  it('formata distâncias em pt-BR', () => {
    expect(formatarDistancia(1234)).toBe('1,2 km');
    expect(formatarDistancia(85)).toBe('90 m');
    expect(formatarDistancia(80)).toBe('80 m');
    expect(formatarDistancia(950)).toBe('950 m');
    expect(formatarDistancia(12345)).toBe('12 km');
    expect(formatarDistancia(1000)).toBe('1,0 km');
  });

  it('mapeia os oito setores', () => {
    expect(direcao(0)).toBe('N');
    expect(direcao(45)).toBe('NE');
    expect(direcao(90)).toBe('L');
    expect(direcao(135)).toBe('SE');
    expect(direcao(180)).toBe('S');
    expect(direcao(225)).toBe('SO');
    expect(direcao(270)).toBe('O');
    expect(direcao(315)).toBe('NO');
    expect(direcao(360)).toBe('N');
    expect(direcao(-45)).toBe('NO');
  });
});
