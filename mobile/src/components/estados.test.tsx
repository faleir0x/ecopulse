import { fireEvent, render } from '@testing-library/react-native';

import { TemaProvider } from '@/theme/tema';

import { EmptyRow } from './EmptyRow';
import { PageError } from './PageError';

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
  it('dispara a ação do vazio', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(
      <TemaProvider inicial="escuro">
        <EmptyRow titulo="Nenhum risco por perto" acao={{ rotulo: 'Relatar', onPress }} />
      </TemaProvider>,
    );

    fireEvent.press(getByText('Relatar'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe('PageError', () => {
  it('tenta de novo na versão completa', async () => {
    const onTentar = jest.fn();
    const { getByText } = await render(
      <TemaProvider inicial="escuro">
        <PageError onTentar={onTentar} />
      </TemaProvider>,
    );

    fireEvent.press(getByText('Tentar de novo'));
    expect(onTentar).toHaveBeenCalledTimes(1);
  });

  it('tenta de novo na versão compacta', async () => {
    const onTentar = jest.fn();
    const { getByText } = await render(
      <TemaProvider inicial="escuro">
        <PageError compacta onTentar={onTentar} />
      </TemaProvider>,
    );

    fireEvent.press(getByText('Tentar'));
    expect(onTentar).toHaveBeenCalledTimes(1);
  });
});
