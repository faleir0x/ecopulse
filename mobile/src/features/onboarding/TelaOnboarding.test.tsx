import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { TelaOnboarding } from './TelaOnboarding';

const mockAtualizar = jest.fn();
const mockReplace = jest.fn();

jest.mock('@/state/ajustes', () => ({
  useAjustes: () => ({ atualizar: mockAtualizar }),
}));

jest.mock('@/theme/tema', () => {
  const tokens = jest.requireActual('@/theme/tokens') as typeof import('@/theme/tokens');
  return {
    useTema: () => ({
      esquema: 'escuro',
      preferencia: 'escuro',
      definirPreferencia: jest.fn(),
      cor: tokens.cores.escuro,
      sev: tokens.severidade.escuro,
      reduzirMovimento: false,
    }),
  };
});

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: (...args: unknown[]) => mockReplace(...args) },
}));

const mockPedirPermissao = jest.fn(async (): Promise<boolean> => true);
jest.mock('@/features/localizacao', () => ({
  pedirPermissao: () => mockPedirPermissao(),
}));

const mockNotificacoes = jest.fn(async (): Promise<{ granted: boolean }> => ({ granted: true }));
jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: () => mockNotificacoes(),
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

describe('TelaOnboarding', () => {
  beforeEach(() => {
    mockAtualizar.mockClear();
    mockReplace.mockClear();
    mockPedirPermissao.mockClear();
    mockNotificacoes.mockClear();
  });

  it('avança da localização para notificações e conclui', async () => {
    const { getByText, getByLabelText, findByText } = await render(<TelaOnboarding />);

    expect(getByText('Riscos perto de você')).toBeTruthy();
    expect(getByText('Permitir localização')).toBeTruthy();

    await fireEvent.press(getByLabelText('Permitir localização'));

    await waitFor(() => expect(mockPedirPermissao).toHaveBeenCalledTimes(1));
    expect(await findByText('Avisos na hora')).toBeTruthy();
    expect(getByText('Permitir notificações')).toBeTruthy();
    expect(mockAtualizar).not.toHaveBeenCalled();

    await fireEvent.press(getByLabelText('Permitir notificações'));

    await waitFor(() =>
      expect(mockAtualizar).toHaveBeenCalledWith({ onboardingConcluido: true }),
    );
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });

  it('"Agora não" pula a localização sem pedir permissão', async () => {
    const { getByLabelText, findByText } = await render(<TelaOnboarding />);

    await fireEvent.press(getByLabelText('Agora não'));

    expect(await findByText('Avisos na hora')).toBeTruthy();
    expect(mockPedirPermissao).not.toHaveBeenCalled();
  });

  it('"Agora não" na segunda tela conclui o onboarding', async () => {
    const { getByLabelText, findByText } = await render(<TelaOnboarding />);

    await fireEvent.press(getByLabelText('Agora não'));
    await findByText('Avisos na hora');
    await fireEvent.press(getByLabelText('Agora não'));

    await waitFor(() =>
      expect(mockAtualizar).toHaveBeenCalledWith({ onboardingConcluido: true }),
    );
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)');
  });
});
