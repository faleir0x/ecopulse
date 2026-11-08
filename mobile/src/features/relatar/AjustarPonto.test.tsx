import { fireEvent, render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TemaProvider } from '@/theme/tema';

import { AjustarPonto } from './AjustarPonto';

jest.mock('react-native-maps', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, PROVIDER_GOOGLE: 'google', default: View };
});

jest.mock('@/features/mapa/useEndereco', () => ({
  useEndereco: () => null,
}));

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: jest.fn(() => null), setItemSync: jest.fn() },
}));

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => undefined),
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
    Easing: { bezier: () => identidade, inOut: identidade, ease: identidade, out: identidade, cubic: identidade },
  };
});

const METRICAS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('AjustarPonto', () => {
  it('devolve o centro do mapa ao usar o ponto', async () => {
    const onUsar = jest.fn();
    const { getByTestId, getByLabelText } = await render(
      <SafeAreaProvider initialMetrics={METRICAS}>
        <TemaProvider inicial="escuro">
          <AjustarPonto
            inicial={{ latitude: -23.5613, longitude: -46.6565 }}
            tipo="alagamento"
            onCancelar={jest.fn()}
            onUsar={onUsar}
          />
        </TemaProvider>
      </SafeAreaProvider>,
    );

    await fireEvent(getByTestId('mapa-ajuste'), 'regionChangeComplete', {
      latitude: -23.55,
      longitude: -46.63,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    });
    await fireEvent.press(getByLabelText('Usar este ponto'));

    expect(onUsar).toHaveBeenCalledWith({ latitude: -23.55, longitude: -46.63 });
  });
});
