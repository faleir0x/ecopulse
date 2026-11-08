import { render } from '@testing-library/react-native';

import { TemaProvider } from '@/theme/tema';

import { WindCard } from './WindCard';

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

function montar(props: Partial<Parameters<typeof WindCard>[0]> = {}) {
  return render(
    <TemaProvider inicial="escuro">
      <WindCard ventoKmh={7.4} direcao={132} rajadaKmh={18} aqi={40} {...props} />
    </TemaProvider>,
  );
}

describe('WindCard', () => {
  it('mostra velocidade, de onde sopra e as rajadas', async () => {
    const { getByText } = await montar();

    expect(getByText('7')).toBeTruthy();
    expect(getByText('km/h')).toBeTruthy();
    expect(getByText('de sudeste')).toBeTruthy();
    expect(getByText('Rajadas 18')).toBeTruthy();
  });

  it('avisa quando o vento é fraco e o ar está ruim', async () => {
    const { getByText } = await montar({ aqi: 153 });

    expect(getByText('Vento fraco: a poluição tende a ficar')).toBeTruthy();
  });

  it('não avisa com ar bom ou vento forte', async () => {
    const bom = await montar({ aqi: 40 });
    expect(bom.queryByText('Vento fraco: a poluição tende a ficar')).toBeNull();

    const forte = await montar({ aqi: 153, ventoKmh: 22, rajadaKmh: 35 });
    expect(forte.queryByText('Vento fraco: a poluição tende a ficar')).toBeNull();
  });

  it('mostra "sem leitura" sem dado de vento', async () => {
    const { queryByText } = await montar({ ventoKmh: null, direcao: null, rajadaKmh: null });

    expect(queryByText('km/h')).toBeNull();
  });
});
