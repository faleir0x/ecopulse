import { fireEvent, render } from '@testing-library/react-native';

import { TemaProvider } from '@/theme/tema';

import { SegmentedFilter } from './SegmentedFilter';

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

const OPCOES = [
  { valor: 'tudo', rotulo: 'Tudo', icone: 'layers-minimalistic' as const },
  { valor: 'calor', rotulo: 'Calor', icone: 'temperature' as const },
];

describe('SegmentedFilter', () => {
  it('chama onChange ao escolher uma opção', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(
      <TemaProvider inicial="escuro">
        <SegmentedFilter opcoes={OPCOES} valor="tudo" onChange={onChange} />
      </TemaProvider>,
    );

    fireEvent.press(getByLabelText('Calor'));
    expect(onChange).toHaveBeenCalledWith('calor');
  });

  it('só mostra o rótulo do item ativo', async () => {
    const { getByText, queryByText } = await render(
      <TemaProvider inicial="escuro">
        <SegmentedFilter opcoes={OPCOES} valor="tudo" onChange={jest.fn()} />
      </TemaProvider>,
    );

    expect(getByText('Tudo')).toBeTruthy();
    expect(queryByText('Calor')).toBeNull();
  });
});
