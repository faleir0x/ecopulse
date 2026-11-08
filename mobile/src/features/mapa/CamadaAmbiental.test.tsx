import type { CelulaAmbiente } from '@/domain/tipos';
import { severidade } from '@/theme/tokens';

import { corDaCelula } from './CamadaAmbiental';

jest.mock('react-native-maps', () => ({ Polygon: () => null }));

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: jest.fn(() => null), setItemSync: jest.fn() },
}));

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const identidade = (valor: unknown) => valor;
  return {
    __esModule: true,
    default: { View },
    useReducedMotion: () => false,
    useAnimatedStyle: (estilo: () => unknown) => estilo(),
    useSharedValue: (inicial: unknown) => ({ value: inicial }),
    withTiming: identidade,
    withSpring: identidade,
    withDelay: (_atraso: number, valor: unknown) => valor,
    withRepeat: identidade,
    Easing: { bezier: () => identidade, inOut: identidade, ease: identidade },
  };
});

const SEV = severidade.escuro;

const CELULA: CelulaAmbiente = {
  geohash: '6gyf4',
  lat_min: -23.55,
  lon_min: -46.65,
  lat_max: -23.5,
  lon_max: -46.6,
  temperatura: 10,
  aqi: 35,
  medido_em: '2026-11-08T12:00:00Z',
};

describe('corDaCelula', () => {
  it('usa a escala OKLab de temperatura com 30% de opacidade', () => {
    expect(corDaCelula({ ...CELULA, temperatura: 10 }, 'calor', SEV)).toBe(
      'rgba(38,139,182,0.3)',
    );
    expect(corDaCelula({ ...CELULA, temperatura: 37 }, 'calor', SEV)).toBe(
      'rgba(211,59,54,0.3)',
    );
  });

  it('usa a cor do nível do AQI com 30% de opacidade', () => {
    expect(corDaCelula({ ...CELULA, aqi: 35 }, 'ar', SEV)).toBe('rgba(173,164,144,0.3)');
    expect(corDaCelula({ ...CELULA, aqi: 120 }, 'ar', SEV)).toBe('rgba(240,137,68,0.3)');
    expect(corDaCelula({ ...CELULA, aqi: 250 }, 'ar', SEV)).toBe('rgba(247,94,84,0.3)');
  });

  it('devolve null sem leitura para a camada', () => {
    expect(corDaCelula({ ...CELULA, temperatura: null }, 'calor', SEV)).toBeNull();
    expect(corDaCelula({ ...CELULA, aqi: null }, 'ar', SEV)).toBeNull();
    expect(corDaCelula(CELULA, 'nenhuma', SEV)).toBeNull();
  });
});
