import type { RotaSegura } from '@/domain/tipos';

import { formatarDuracao, minutosExtras } from './formato';

function rota(duracao_s: number, direta: RotaSegura['direta']): RotaSegura {
  return {
    modo: 'pedestre',
    distancia_m: 1000,
    duracao_s,
    coordenadas: [
      [-23.56, -46.65],
      [-23.57, -46.66],
    ],
    evitadas: [],
    no_caminho: [],
    sem_desvio: false,
    direta,
    aviso: null,
  };
}

describe('formatarDuracao', () => {
  it('arredonda para cima e usa no mínimo 1 minuto', () => {
    expect(formatarDuracao(30)).toBe('1 min');
    expect(formatarDuracao(840)).toBe('14 min');
  });

  it('mostra horas e minutos', () => {
    expect(formatarDuracao(3600)).toBe('1 h');
    expect(formatarDuracao(3900)).toBe('1 h 5 min');
  });
});

describe('minutosExtras', () => {
  it('arredonda a diferença para a rota direta', () => {
    expect(
      minutosExtras(
        rota(840, { distancia_m: 900, duracao_s: 660, coordenadas: [], atravessa: [] }),
      ),
    ).toBe(3);
  });

  it('nunca fica negativo', () => {
    expect(
      minutosExtras(
        rota(600, { distancia_m: 900, duracao_s: 900, coordenadas: [], atravessa: [] }),
      ),
    ).toBe(0);
  });

  it('é zero sem rota direta', () => {
    expect(minutosExtras(rota(840, null))).toBe(0);
  });
});
