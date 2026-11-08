import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { TIPOS_RISCO, type Severidade, type TipoRisco } from '@/domain/tipos';

import { TelaAjustes } from './TelaAjustes';

const mockAtualizar = jest.fn();
const mockDefinirPreferencia = jest.fn();

const mockEstado = {
  raioM: 1000 as const,
  limiar: 'moderado' as Severidade,
  tiposAtivos: [...TIPOS_RISCO] as TipoRisco[],
  onboardingConcluido: true,
  atualizar: mockAtualizar,
};

jest.mock('@/state/ajustes', () => ({
  RAIOS_M: [500, 1000, 2000],
  useAjustes: () => mockEstado,
}));

jest.mock('@/state/relatos', () => ({
  useRelatos: () => ({ meus: [{}, {}, {}] }),
}));

jest.mock('@/theme/tema', () => {
  const tokens = jest.requireActual('@/theme/tokens') as typeof import('@/theme/tokens');
  return {
    useTema: () => ({
      esquema: 'escuro',
      preferencia: 'escuro',
      definirPreferencia: mockDefinirPreferencia,
      cor: tokens.cores.escuro,
      sev: tokens.severidade.escuro,
      reduzirMovimento: false,
    }),
  };
});

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn() },
}));

const mockGetPermissions = jest.fn(
  async (): Promise<{ granted: boolean; canAskAgain: boolean }> => ({
    granted: false,
    canAskAgain: true,
  }),
);
const mockRequestPermissions = jest.fn(
  async (): Promise<{ granted: boolean; canAskAgain: boolean }> => ({
    granted: true,
    canAskAgain: true,
  }),
);

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: () => mockGetPermissions(),
  requestPermissionsAsync: () => mockRequestPermissions(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
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
    FadeIn: { duration: () => undefined },
    SlideInRight: { duration: () => undefined },
  };
});

describe('TelaAjustes', () => {
  beforeEach(() => {
    mockAtualizar.mockClear();
    mockDefinirPreferencia.mockClear();
    mockGetPermissions.mockClear();
    mockGetPermissions.mockResolvedValue({ granted: false, canAskAgain: true });
    mockRequestPermissions.mockClear();
    mockRequestPermissions.mockResolvedValue({ granted: true, canAskAgain: true });
    mockEstado.tiposAtivos = [...TIPOS_RISCO];
  });

  it('muda o raio chamando atualizar', async () => {
    const { getByLabelText } = await render(<TelaAjustes />);

    fireEvent.press(getByLabelText('2 km'));

    expect(mockAtualizar).toHaveBeenCalledWith({ raioM: 2000 });
  });

  it('não deixa desligar o último tipo ativo', async () => {
    mockEstado.tiposAtivos = ['alagamento'];
    const { getByLabelText } = await render(<TelaAjustes />);

    fireEvent.press(getByLabelText('Alagamento'));

    expect(mockAtualizar).not.toHaveBeenCalled();
  });

  it('muda o tema chamando definirPreferencia', async () => {
    const { getByLabelText } = await render(<TelaAjustes />);

    fireEvent.press(getByLabelText('Claro'));

    expect(mockDefinirPreferencia).toHaveBeenCalledWith('claro');
  });

  it('mostra o aviso discreto e pede a permissão ao ativar', async () => {
    const { findByText, getByLabelText } = await render(<TelaAjustes />);

    await findByText('Notificações desligadas · Ativar');
    await fireEvent.press(getByLabelText('Ativar notificações'));

    await waitFor(() => expect(mockRequestPermissions).toHaveBeenCalledTimes(1));
  });

  it('abre as configurações quando a permissão foi negada de vez', async () => {
    mockRequestPermissions.mockResolvedValue({ granted: false, canAskAgain: false });
    const abrirConfiguracoes = jest
      .spyOn(Linking, 'openSettings')
      .mockResolvedValue(undefined);
    const { findByText, getByLabelText } = await render(<TelaAjustes />);

    await findByText('Notificações desligadas · Ativar');
    await fireEvent.press(getByLabelText('Ativar notificações'));

    await waitFor(() => expect(abrirConfiguracoes).toHaveBeenCalledTimes(1));
    abrirConfiguracoes.mockRestore();
  });
});
