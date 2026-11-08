import { fireEvent, render, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { TemaProvider } from '@/theme/tema';

import { ThresholdRuler } from './ThresholdRuler';

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

describe('ThresholdRuler', () => {
  it('chama onChange com o nível escolhido', async () => {
    const onChange = jest.fn();
    const { getByText } = await render(
      <TemaProvider inicial="escuro">
        <ThresholdRuler valor="alto" onChange={onChange} />
      </TemaProvider>,
    );

    fireEvent.press(getByText('Moderado'));
    expect(onChange).toHaveBeenCalledWith('moderado');
  });

  it('apaga o medidor dos níveis abaixo do limiar', async () => {
    const { getByTestId, getByText } = await render(
      <TemaProvider inicial="escuro">
        <ThresholdRuler valor="alto" onChange={jest.fn()} />
      </TemaProvider>,
    );

    const baixo = within(getByTestId('limiar-baixo'));
    for (const barra of baixo.getAllByTestId(/^barra-severidade-/)) {
      expect(StyleSheet.flatten(barra.props.style).backgroundColor).toBe('#2A2A2E');
    }
    expect(StyleSheet.flatten(getByText('Baixo').props.style).color).toBe('#85858C');

    const alto = within(getByTestId('limiar-alto'));
    const acesas = alto
      .getAllByTestId(/^barra-severidade-/)
      .filter(
        (barra) => StyleSheet.flatten(barra.props.style).backgroundColor === '#F08944',
      );
    expect(acesas).toHaveLength(3);
  });
});
