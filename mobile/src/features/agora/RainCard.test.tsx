import { render } from '@testing-library/react-native';

import { TemaProvider } from '@/theme/tema';

import { RainCard } from './RainCard';

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

describe('RainCard', () => {
  it('mostra "Sem chuva" e barras baixas sem chuva', async () => {
    const { getByText } = await render(
      <TemaProvider inicial="escuro">
        <RainCard chuva3h={[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]} />
      </TemaProvider>,
    );

    expect(getByText('Sem chuva')).toBeTruthy();
    expect(getByText('agora')).toBeTruthy();
    expect(getByText('+3 h')).toBeTruthy();
  });

  it('mostra "Sem leitura agora" sem dados', async () => {
    const { getByText } = await render(
      <TemaProvider inicial="escuro">
        <RainCard chuva3h={null} />
      </TemaProvider>,
    );

    expect(getByText('Sem leitura agora')).toBeTruthy();
  });
});
