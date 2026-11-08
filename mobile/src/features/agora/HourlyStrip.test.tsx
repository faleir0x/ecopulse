import { render } from '@testing-library/react-native';

import { TemaProvider } from '@/theme/tema';

import type { HoraPrevista } from '@/domain/tipos';

import { HourlyStrip } from './HourlyStrip';

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

function horas(probs: (number | null)[]): HoraPrevista[] {
  return probs.map((prob, i) => ({
    hora: `2026-11-08T${String(12 + i).padStart(2, '0')}:00:00Z`,
    temperatura: 21,
    codigo_tempo: 3,
    chuva_mm: 0,
    prob_chuva: prob,
  }));
}

function montar(lista: HoraPrevista[], agora: number | null = null) {
  return render(
    <TemaProvider inicial="escuro">
      <HourlyStrip horas={lista} agora={agora} />
    </TemaProvider>,
  );
}

describe('HourlyStrip', () => {
  it('mostra a chance de chuva das horas acima do mínimo', async () => {
    const { getByText } = await montar(horas([10, 45, 60]));

    expect(getByText('45%')).toBeTruthy();
    expect(getByText('60%')).toBeTruthy();
  });

  it('sem chance relevante, não reserva a linha', async () => {
    const { queryByText } = await montar(horas([0, 5, 10]));

    expect(queryByText('10%')).toBeNull();
  });

  it('"Agora" usa a temperatura atual', async () => {
    const { getAllByText, getByText } = await montar(horas([0, 0]), 19.6);

    expect(getByText('20°')).toBeTruthy();
    expect(getAllByText('21°')).toHaveLength(1);
  });
});
