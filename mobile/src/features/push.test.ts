import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { removerAparelho, registrarAparelho } from '@/api/cliente';

import {
  CHAVE_REGISTRO,
  RENOVAR_APOS_MS,
  deveRenovar,
  lerRegistro,
  salvarRegistro,
  usePushRemoto,
  type DadosRegistro,
  type ParametrosPush,
  type RegistroPush,
} from './push';

// jest-expo roda como iOS por padrão; o push só existe no Android
(Platform as { OS: string }).OS = 'android';

const mockArmazenado = new Map<string, string>();
let mockAmbiente = 'standalone';

jest.mock('expo', () => ({
  isRunningInExpoGo: () => mockAmbiente === 'storeClient',
}));

const mockPermissao = jest.fn();
const mockToken = jest.fn();
const mockAddTokenListener = jest.fn();

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: (...args: unknown[]) => mockPermissao(...args),
  getDevicePushTokenAsync: (...args: unknown[]) => mockToken(...args),
  addPushTokenListener: (...args: unknown[]) => mockAddTokenListener(...args),
}));

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: {
    getItemSync: jest.fn((chave: string) => mockArmazenado.get(chave) ?? null),
    setItemSync: jest.fn((chave: string, valor: string) => {
      mockArmazenado.set(chave, valor);
    }),
    removeItemSync: jest.fn((chave: string) => {
      mockArmazenado.delete(chave);
    }),
  },
}));

jest.mock('@/api/cliente', () => ({
  registrarAparelho: jest.fn(),
  removerAparelho: jest.fn(),
}));

jest.mock('@/data/aparelho', () => ({ idAparelho: () => 'aparelho-1' }));

const registrarMock = registrarAparelho as jest.MockedFunction<typeof registrarAparelho>;
const removerMock = removerAparelho as jest.MockedFunction<typeof removerAparelho>;

const AGORA = 1_700_000_000_000;

const BASE: DadosRegistro = {
  token: 'token-fcm',
  latitude: -23.55,
  longitude: -46.65,
  raioM: 1000,
  limiar: 'moderado',
  tipos: ['alagamento', 'calor'],
  silenciadoAte: 0,
};

const ANTERIOR: RegistroPush = { ...BASE, enviadoEm: AGORA - 60_000 };

const PARAMETROS: ParametrosPush = {
  posicao: { latitude: -23.55, longitude: -46.65 },
  raioM: 1000,
  limiar: 'moderado',
  tiposAtivos: ['alagamento', 'calor'],
  silenciadoAte: 0,
};

function montarHook(parametros: ParametrosPush = PARAMETROS) {
  return renderHook((p: ParametrosPush) => usePushRemoto(p), { initialProps: parametros });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockArmazenado.clear();
  mockAmbiente = 'standalone';
  mockPermissao.mockResolvedValue({ granted: true, status: 'granted' });
  mockToken.mockResolvedValue({ type: 'android', data: 'token-fcm' });
  mockAddTokenListener.mockReturnValue({ remove: jest.fn() });
  registrarMock.mockResolvedValue(undefined);
  removerMock.mockResolvedValue(undefined);
});

describe('deveRenovar', () => {
  it('renova sem registro anterior', () => {
    expect(deveRenovar(null, BASE, AGORA)).toBe(true);
  });

  it('não renova com os mesmos dados e pouco tempo depois', () => {
    expect(deveRenovar(ANTERIOR, { ...BASE }, AGORA)).toBe(false);
  });

  it('não renova quando os tipos vêm em outra ordem', () => {
    expect(
      deveRenovar(ANTERIOR, { ...BASE, tipos: ['calor', 'alagamento'] }, AGORA),
    ).toBe(false);
  });

  it('renova quando token, raio, limiar ou silêncio mudam', () => {
    expect(deveRenovar(ANTERIOR, { ...BASE, token: 'outro' }, AGORA)).toBe(true);
    expect(deveRenovar(ANTERIOR, { ...BASE, raioM: 2000 }, AGORA)).toBe(true);
    expect(deveRenovar(ANTERIOR, { ...BASE, limiar: 'alto' }, AGORA)).toBe(true);
    expect(deveRenovar(ANTERIOR, { ...BASE, silenciadoAte: AGORA + 60_000 }, AGORA)).toBe(
      true,
    );
  });

  it('renova depois de andar mais de 500 m', () => {
    // ~0,0054° de latitude ≈ 600 m
    expect(deveRenovar(ANTERIOR, { ...BASE, latitude: -23.5446 }, AGORA)).toBe(true);
    // ~0,0009° de latitude ≈ 100 m
    expect(deveRenovar(ANTERIOR, { ...BASE, latitude: -23.5491 }, AGORA)).toBe(false);
  });

  it('renova 24 h depois do último envio', () => {
    expect(deveRenovar(ANTERIOR, BASE, ANTERIOR.enviadoEm + RENOVAR_APOS_MS)).toBe(true);
  });
});

describe('registro no storage', () => {
  it('faz ida e volta', () => {
    salvarRegistro(ANTERIOR);
    expect(lerRegistro()).toEqual(ANTERIOR);
  });

  it('apaga com null', () => {
    salvarRegistro(ANTERIOR);
    salvarRegistro(null);
    expect(lerRegistro()).toBeNull();
  });

  it('ignora lixo', () => {
    mockArmazenado.set(CHAVE_REGISTRO, '{nem é json');
    expect(lerRegistro()).toBeNull();

    mockArmazenado.set(CHAVE_REGISTRO, JSON.stringify({ token: 1 }));
    expect(lerRegistro()).toBeNull();
  });
});

describe('usePushRemoto', () => {
  it('registra e salva com permissão e posição', async () => {
    await montarHook();

    await waitFor(() => expect(registrarMock).toHaveBeenCalledTimes(1));

    expect(registrarMock).toHaveBeenCalledWith('aparelho-1', {
      token: 'token-fcm',
      latitude: -23.55,
      longitude: -46.65,
      raio_m: 1000,
      limiar: 'moderado',
      tipos: ['alagamento', 'calor'],
      silenciado_ate: null,
    });
    expect(mockToken).toHaveBeenCalledTimes(1);
    expect(lerRegistro()).toMatchObject({
      token: 'token-fcm',
      enviadoEm: expect.any(Number) as number,
    });
  });

  it('não registra de novo com os mesmos dados', async () => {
    const { rerender } = await montarHook();
    await waitFor(() => expect(registrarMock).toHaveBeenCalledTimes(1));

    await rerender(PARAMETROS);
    await act(async () => {
      await Promise.resolve();
    });

    expect(registrarMock).toHaveBeenCalledTimes(1);
  });

  it('remove o aparelho quando a permissão foi negada', async () => {
    mockPermissao.mockResolvedValue({ granted: false, status: 'denied' });
    salvarRegistro(ANTERIOR);

    await montarHook();

    await waitFor(() => expect(removerMock).toHaveBeenCalledWith('aparelho-1'));
    expect(registrarMock).not.toHaveBeenCalled();
    expect(lerRegistro()).toBeNull();
  });

  it('não faz nada no Expo Go', async () => {
    mockAmbiente = 'storeClient';

    await montarHook();
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockPermissao).not.toHaveBeenCalled();
    expect(mockToken).not.toHaveBeenCalled();
    expect(mockAddTokenListener).not.toHaveBeenCalled();
    expect(registrarMock).not.toHaveBeenCalled();
    expect(removerMock).not.toHaveBeenCalled();
  });
});
