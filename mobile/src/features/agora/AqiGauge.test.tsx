import { render } from '@testing-library/react-native';

import { TemaProvider } from '@/theme/tema';

import { AqiGauge, segmentosAcesos } from './AqiGauge';

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

describe('AqiGauge', () => {
  it('acende o número certo de segmentos para o AQI', async () => {
    const { getAllByTestId } = await render(
      <TemaProvider inicial="escuro">
        <AqiGauge aqi={162} />
      </TemaProvider>,
    );

    expect(segmentosAcesos(162)).toBe(11);
    expect(getAllByTestId('aqi-segmento-aceso')).toHaveLength(11);
    expect(getAllByTestId('aqi-segmento-apagado')).toHaveLength(10);
  });

  it('não acende segmentos sem leitura', async () => {
    const { queryAllByTestId, getByText } = await render(
      <TemaProvider inicial="escuro">
        <AqiGauge aqi={null} />
      </TemaProvider>,
    );

    expect(queryAllByTestId('aqi-segmento-aceso')).toHaveLength(0);
    expect(getByText('Sem leitura agora')).toBeTruthy();
  });
});
