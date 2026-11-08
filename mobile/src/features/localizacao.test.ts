import { lerSimulada, lerTrajeto, posicaoNaLinha, posicaoNoTrajeto } from './localizacao';

jest.mock('expo-location', () => ({}));

describe('localização simulada', () => {
  it('lê um ponto e um trajeto, ignorando partes inválidas', () => {
    expect(lerSimulada('-23.5,-46.6')).toEqual({ latitude: -23.5, longitude: -46.6 });
    expect(lerSimulada('abc')).toBeNull();
    expect(lerTrajeto('-23.5,-46.6; x ;-23.6,-46.7')).toHaveLength(2);
  });

  it('percorre o trajeto e volta', () => {
    const pontos = [
      { latitude: 0, longitude: 0 },
      { latitude: 0.001, longitude: 0 }, // ~111 m ao norte
    ];
    expect(posicaoNoTrajeto(pontos, 0)).toEqual(pontos[0]);
    expect(posicaoNoTrajeto(pontos, 55.66).latitude).toBeCloseTo(0.0005, 4);
    // ida (111 m) + metade da volta → de novo no meio
    expect(posicaoNoTrajeto(pontos, 111.32 + 55.66).latitude).toBeCloseTo(0.0005, 4);
  });
});

describe('posicaoNaLinha', () => {
  const linha = [
    { latitude: 0, longitude: 0 },
    { latitude: 0.001, longitude: 0 },
    { latitude: 0.001, longitude: 0.001 },
  ];

  it('anda pela linha e para no último ponto', () => {
    expect(posicaoNaLinha(linha, 0)).toEqual(linha[0]);
    expect(posicaoNaLinha(linha, 55.66).latitude).toBeCloseTo(0.0005, 4);
    expect(posicaoNaLinha(linha, 10_000)).toEqual(linha[2]);
  });

  it('trata metros negativos como o início', () => {
    expect(posicaoNaLinha(linha, -5)).toEqual(linha[0]);
  });
});
