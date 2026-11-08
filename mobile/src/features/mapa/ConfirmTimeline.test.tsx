import { render } from '@testing-library/react-native';

import { TemaProvider } from '@/theme/tema';

import { ConfirmTimeline } from './ConfirmTimeline';

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

function itens(quantidade: number): string[] {
  const base = new Date(2026, 10, 7, 12, 8, 0).getTime();
  return Array.from({ length: quantidade }, (_, i) =>
    new Date(base + i * 60_000).toISOString(),
  );
}

describe('ConfirmTimeline', () => {
  it('mostra um ponto por item da linha do tempo', async () => {
    const { getAllByTestId, getByText } = await render(
      <TemaProvider inicial="escuro">
        <ConfirmTimeline itens={itens(5)} severidade="alto" />
      </TemaProvider>,
    );

    expect(getAllByTestId('ponto-timeline')).toHaveLength(5);
    expect(getByText('5')).toBeTruthy();
    expect(getByText('12:08')).toBeTruthy();
    expect(getByText('agora')).toBeTruthy();
  });

  it('limita a 12 pontos visíveis', async () => {
    const { getAllByTestId, getByText } = await render(
      <TemaProvider inicial="escuro">
        <ConfirmTimeline itens={itens(30)} severidade="critico" />
      </TemaProvider>,
    );

    expect(getAllByTestId('ponto-timeline')).toHaveLength(12);
    expect(getByText('30')).toBeTruthy();
  });
});
