import { render } from '@testing-library/react-native';

import { TemaProvider } from '@/theme/tema';

import { TelaAgora } from './TelaAgora';

const mockRefetchAmbiente = jest.fn();
const mockRefetchOcorrencias = jest.fn();

jest.mock('@/features/localizacao', () => ({
  useLocalizacao: () => ({
    status: 'ok',
    coords: { latitude: -23.55, longitude: -46.65 },
    precisaoM: 12,
    simulada: true,
  }),
}));

jest.mock('@/features/agora/ambiente', () => ({
  useAmbiente: () => ({
    data: null,
    isPending: false,
    isError: false,
    refetch: mockRefetchAmbiente,
  }),
}));

jest.mock('@/features/ocorrencias', () => ({
  useOcorrencias: () => ({
    data: [],
    isPending: false,
    isError: false,
    refetch: mockRefetchOcorrencias,
  }),
}));

jest.mock('@/features/mapa/useEndereco', () => ({
  useEndereco: () => 'Barra Funda',
}));

jest.mock('@/state/ajustes', () => ({
  useAjustes: () => ({ raioM: 1000 }),
}));

jest.mock('@/state/relatos', () => ({
  useRelatos: () => ({ estado: { online: true, pendentes: 0 } }),
}));

jest.mock('@/state/ui', () => ({
  useUi: () => ({
    setOcorrenciaFoco: jest.fn(),
    setRelatarAberto: jest.fn(),
  }),
}));

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn() },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
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

describe('TelaAgora', () => {
  it('mostra "Sem leitura agora" quando a API responde 404', async () => {
    const { getAllByText, getByText } = await render(
      <TemaProvider inicial="escuro">
        <TelaAgora />
      </TemaProvider>,
    );

    expect(getAllByText('Sem leitura agora').length).toBeGreaterThan(0);
    expect(getByText('Barra Funda')).toBeTruthy();
    expect(getByText('Perto de você')).toBeTruthy();
    expect(getByText('Nenhum risco por perto')).toBeTruthy();
  });
});
