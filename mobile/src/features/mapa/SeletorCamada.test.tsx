import { fireEvent, render } from '@testing-library/react-native';

import { TemaProvider } from '@/theme/tema';

import { SeletorCamada } from './SeletorCamada';

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

function montar(onChange = jest.fn()) {
  return render(
    <TemaProvider inicial="escuro">
      <SeletorCamada valor="nenhuma" onChange={onChange} />
    </TemaProvider>,
  );
}

describe('SeletorCamada', () => {
  it('abre as opções e fecha ao escolher uma camada', async () => {
    const onChange = jest.fn();
    const { getByLabelText, getByText, queryByText } = await montar(onChange);

    expect(queryByText('Nenhuma')).toBeNull();

    await fireEvent.press(getByLabelText('Camadas'));
    expect(getByText('Nenhuma')).toBeTruthy();

    await fireEvent.press(getByText('Calor'));

    expect(onChange).toHaveBeenCalledWith('calor');
    expect(queryByText('Nenhuma')).toBeNull();
  });

  it('fecha ao tocar no botão de camadas de novo', async () => {
    const { getByLabelText, getByText, queryByText } = await montar();

    await fireEvent.press(getByLabelText('Camadas'));
    expect(getByText('Ar')).toBeTruthy();

    await fireEvent.press(getByLabelText('Camadas'));
    expect(queryByText('Ar')).toBeNull();
  });
});
