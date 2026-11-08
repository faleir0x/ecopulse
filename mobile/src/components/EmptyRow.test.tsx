import { render } from '@testing-library/react-native';

import { TemaProvider } from '@/theme/tema';

import { EmptyRow } from './EmptyRow';

jest.mock('@/icons/Icon', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  return {
    Icon: ({ name }: { name: string }) => React.createElement(View, { testID: name }),
  };
});

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

describe('EmptyRow', () => {
  it('usa check-circle por padrão', async () => {
    const { getByTestId } = await render(
      <TemaProvider inicial="escuro">
        <EmptyRow titulo="Nenhum risco por perto" />
      </TemaProvider>,
    );

    expect(getByTestId('check-circle')).toBeTruthy();
  });

  it('usa o ícone informado', async () => {
    const { getByTestId, queryByTestId } = await render(
      <TemaProvider inicial="escuro">
        <EmptyRow titulo="Nenhum alerta" icone="bell-off" />
      </TemaProvider>,
    );

    expect(getByTestId('bell-off')).toBeTruthy();
    expect(queryByTestId('check-circle')).toBeNull();
  });
});
