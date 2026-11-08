import { render } from '@testing-library/react-native';

import { TemaProvider } from '@/theme/tema';

import { LegendaCamada } from './LegendaCamada';

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

function montar(camada: 'nenhuma' | 'calor' | 'ar', carregando = false) {
  return render(
    <TemaProvider inicial="escuro">
      <LegendaCamada camada={camada} carregando={carregando} />
    </TemaProvider>,
  );
}

describe('LegendaCamada', () => {
  it('mostra o gradiente e os extremos na camada de calor', async () => {
    const { getByText } = await montar('calor');

    expect(getByText('10° · 36°')).toBeTruthy();
  });

  it('mostra os quatro níveis na camada de ar', async () => {
    const { getByText, getAllByTestId } = await montar('ar');

    expect(getByText('Baixo → Crítico')).toBeTruthy();
    expect(getAllByTestId(/^legenda-ar-/)).toHaveLength(4);
  });

  it('mostra "Carregando camada…" enquanto não há leitura', async () => {
    const { getByText, queryByText } = await montar('calor', true);

    expect(getByText('Carregando camada…')).toBeTruthy();
    expect(queryByText('10° · 36°')).toBeNull();
  });

  it('não aparece com a camada nenhuma', async () => {
    const { toJSON } = await montar('nenhuma');

    expect(toJSON()).toBeNull();
  });
});
