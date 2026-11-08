import { fireEvent, render } from '@testing-library/react-native';

import { TemaProvider } from '@/theme/tema';

import { Button } from './Button';

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

describe('Button', () => {
  it('não chama onPress quando desabilitado', async () => {
    const onPress = jest.fn();
    const { getByLabelText } = await render(
      <TemaProvider inicial="escuro">
        <Button rotulo="Enviar" desabilitado onPress={onPress} />
      </TemaProvider>,
    );

    fireEvent.press(getByLabelText('Enviar'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('mostra o indicador e não dispara enquanto carrega', async () => {
    const onPress = jest.fn();
    const { getByLabelText, getByTestId, queryByText } = await render(
      <TemaProvider inicial="escuro">
        <Button rotulo="Enviar" carregando onPress={onPress} />
      </TemaProvider>,
    );

    expect(getByTestId('botao-carregando')).toBeTruthy();
    expect(queryByText('Enviar')).toBeNull();

    fireEvent.press(getByLabelText('Enviar'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('dispara onPress quando ativo', async () => {
    const onPress = jest.fn();
    const { getByLabelText } = await render(
      <TemaProvider inicial="escuro">
        <Button rotulo="Enviar" onPress={onPress} />
      </TemaProvider>,
    );

    fireEvent.press(getByLabelText('Enviar'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
