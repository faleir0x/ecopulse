import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';

import { TemaProvider } from '@/theme/tema';

import { TelaLocal } from './TelaLocal';

const mockBuscarLocais = jest.fn();

jest.mock('@/api/cliente', () => ({
  buscarLocais: (...args: unknown[]) => mockBuscarLocais(...args),
}));

const mockEscolherLocal = jest.fn();
const mockPedirPermissao = jest.fn();

jest.mock('@/features/localizacao', () => ({
  escolherLocal: (...args: unknown[]) => mockEscolherLocal(...args),
  pedirPermissao: (...args: unknown[]) => mockPedirPermissao(...args),
  ultimaPosicaoConhecida: () => ({ latitude: -23.548, longitude: -46.644 }),
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: jest.fn(() => null), setItemSync: jest.fn(), removeItemSync: jest.fn() },
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

function montar() {
  return render(
    <TemaProvider inicial="escuro">
      <TelaLocal />
    </TemaProvider>,
  );
}

describe('TelaLocal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuscarLocais.mockResolvedValue([
      { nome: 'Pinheiros', detalhe: 'São Paulo', latitude: -23.5613, longitude: -46.6916 },
    ]);
  });

  it('busca com geocodificação e mostra os resultados', async () => {
    const { getByPlaceholderText, getByText, findByText } = await montar();

    await fireEvent.changeText(getByPlaceholderText('Bairro ou endereço'), 'Pinheiros');
    await findByText('Pinheiros', {}, { timeout: 2000 });

    expect(getByText('Pinheiros')).toBeTruthy();
    expect(getByText('São Paulo')).toBeTruthy();
    expect(mockBuscarLocais).toHaveBeenCalledWith('Pinheiros', { latitude: -23.548, longitude: -46.644 });
  });

  it('escolhe o resultado tocado e volta', async () => {
    const { getByPlaceholderText, getByText, findByText } = await montar();

    await fireEvent.changeText(getByPlaceholderText('Bairro ou endereço'), 'Pinheiros');
    await findByText('Pinheiros', {}, { timeout: 2000 });

    await fireEvent.press(getByText('Pinheiros'));

    expect(mockEscolherLocal).toHaveBeenCalledWith({
      latitude: -23.5613,
      longitude: -46.6916,
      nome: 'Pinheiros',
    });
    expect(mockEscolherLocal).toHaveBeenCalledTimes(1);
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
