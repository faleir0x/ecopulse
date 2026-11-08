import { render } from '@testing-library/react-native';

import { TemaProvider } from '@/theme/tema';

import { OfflinePill } from './OfflinePill';

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

describe('OfflinePill', () => {
  it('usa o singular com um relato pendente', async () => {
    const { getByText } = await render(
      <TemaProvider inicial="escuro">
        <OfflinePill pendentes={1} />
      </TemaProvider>,
    );

    expect(getByText('Offline · 1 relato na fila')).toBeTruthy();
  });

  it('usa o plural com vários relatos pendentes', async () => {
    const { getByText } = await render(
      <TemaProvider inicial="escuro">
        <OfflinePill pendentes={4} />
      </TemaProvider>,
    );

    expect(getByText('Offline · 4 relatos na fila')).toBeTruthy();
  });
});

it('com rede e fila mostra "Enviando"', async () => {
  const { getByText } = await render(
    <TemaProvider inicial="escuro">
      <OfflinePill pendentes={2} online />
    </TemaProvider>,
  );
  expect(getByText('Enviando · 2 relatos na fila')).toBeTruthy();
});
