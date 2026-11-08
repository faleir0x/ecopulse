import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { TemaProvider } from '@/theme/tema';

import { TelaAlertas } from './TelaAlertas';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn() },
}));

const mockNavigate = router.navigate as jest.Mock;

jest.mock('@/state/alertas', () => ({
  useAlertas: () => ({
    alertas: [],
    naoLidos: 0,
    conexao: 'conectado',
    marcarLido: jest.fn(),
    abrir: jest.fn(),
  }),
}));

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

const METRICAS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('TelaAlertas', () => {
  it('mostra o título e o vazio com ação para ajustar alertas', async () => {
    const { getByText, getByLabelText } = await render(
      <SafeAreaProvider initialMetrics={METRICAS}>
        <TemaProvider inicial="escuro">
          <TelaAlertas />
        </TemaProvider>
      </SafeAreaProvider>,
    );

    expect(getByText('Alertas')).toBeTruthy();
    expect(getByText('Nenhum alerta')).toBeTruthy();

    await fireEvent.press(getByLabelText('Ajustar alertas'));
    expect(mockNavigate).toHaveBeenCalledWith('/ajustes');
  });
});
