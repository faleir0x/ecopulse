import { render } from '@testing-library/react-native';

import type { LeituraAmbiente } from '@/domain/tipos';
import { TemaProvider } from '@/theme/tema';

import { TempHero } from './TempHero';

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

const LEITURA: LeituraAmbiente = {
  geohash: '6gyf4',
  latitude: -23.55,
  longitude: -46.65,
  medido_em: '2026-11-08T14:00:00-03:00',
  fonte: 'open-meteo',
  temperatura: 27.4,
  sensacao: 29.4,
  codigo_tempo: 0,
  minima_dia: 19,
  maxima_dia: 31,
  aqi: 42,
  chuva_mm_h: 0,
  proximas_horas: [],
  chuva_3h: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

describe('TempHero', () => {
  it('mostra temperatura, condição e sensação', async () => {
    const { getByText } = await render(
      <TemaProvider inicial="escuro">
        <TempHero leitura={LEITURA} />
      </TemaProvider>,
    );

    expect(getByText('27°')).toBeTruthy();
    expect(getByText('Ensolarado')).toBeTruthy();
    expect(getByText('Sensação 29°')).toBeTruthy();
  });

  it('mostra "Sem leitura agora" sem leitura', async () => {
    const { getByText } = await render(
      <TemaProvider inicial="escuro">
        <TempHero leitura={null} />
      </TemaProvider>,
    );

    expect(getByText('Sem leitura agora')).toBeTruthy();
    expect(getByText('—')).toBeTruthy();
  });
});

describe('TempHero umidade', () => {
  it('mostra a umidade normal', async () => {
    const { getByText } = await render(
      <TemaProvider inicial="escuro">
        <TempHero leitura={{ ...LEITURA, umidade: 72 }} />
      </TemaProvider>,
    );

    expect(getByText('Umidade 72%')).toBeTruthy();
  });

  it('avisa ar seco abaixo de 30%', async () => {
    const { getByText } = await render(
      <TemaProvider inicial="escuro">
        <TempHero leitura={{ ...LEITURA, umidade: 24 }} />
      </TemaProvider>,
    );

    expect(getByText('Ar seco · 24%')).toBeTruthy();
  });
});
