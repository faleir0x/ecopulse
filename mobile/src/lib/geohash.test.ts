import { celulasNoRaio, decodeBbox, encode, MAX_CELULAS_ASSINATURA, vizinhos } from './geohash';

describe('geohash', () => {
  it('codifica os mesmos exemplos da implementação Python', () => {
    expect(encode(-23.5505, -46.6333, 6)).toBe('6gyf4b');
    expect(encode(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
  });

  it('rejeita coordenadas e hashes inválidos', () => {
    expect(() => encode(91, 0, 6)).toThrow();
    expect(() => encode(0, 181, 6)).toThrow();
    expect(() => encode(Number.NaN, 0, 6)).toThrow();
    expect(() => encode(0, 0, 0)).toThrow();
    expect(() => decodeBbox('6gyf4!')).toThrow();
    expect(() => decodeBbox('')).toThrow();
  });

  it('decodifica a caixa da célula', () => {
    const caixa = decodeBbox('6gyf4b');
    expect(caixa.latMin).toBeLessThan(-23.5505);
    expect(caixa.latMax).toBeGreaterThan(-23.5505);
    expect(caixa.lonMin).toBeLessThan(-46.6333);
    expect(caixa.lonMax).toBeGreaterThan(-46.6333);
    expect(caixa.latMax - caixa.latMin).toBeCloseTo(180 / 2 ** 15, 10);
    expect(caixa.lonMax - caixa.lonMin).toBeCloseTo(360 / 2 ** 15, 10);
  });

  it('devolve 8 vizinhos de precisão 6, sem o próprio centro', () => {
    const centro = encode(-23.5505, -46.6333, 6);
    const lista = vizinhos(centro);
    expect(lista).toHaveLength(8);
    expect(lista).not.toContain(centro);
    for (const celula of lista) {
      expect(celula).toHaveLength(6);
    }
  });

  it('cobre o raio de 500 m em São Paulo com células de precisão 6', () => {
    const centro = encode(-23.5505, -46.6333, 6);
    const celulas = celulasNoRaio(-23.5505, -46.6333, 500);
    expect(celulas.length).toBeGreaterThanOrEqual(4);
    expect(celulas.length).toBeLessThanOrEqual(15);
    expect(celulas).toContain(centro);
    expect(new Set(celulas).size).toBe(celulas.length);
    for (const celula of celulas) {
      expect(celula).toHaveLength(6);
    }
  });

  it('respeita o limite de 50 células em um raio de 2 km', () => {
    const celulas = celulasNoRaio(-23.5505, -46.6333, 2000);
    expect(celulas.length).toBeLessThanOrEqual(MAX_CELULAS_ASSINATURA);
    expect(celulas).toContain(encode(-23.5505, -46.6333, 6));
  });
});
