import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  escolherLocal,
  lerSimulada,
  lerTrajeto,
  pedirPermissao,
  posicaoNaLinha,
  posicaoNoTrajeto,
  useLocalEscolhido,
  useLocalizacao,
} from './localizacao';

const mockRequest = jest.fn();
const mockWatch = jest.fn();
const mockOpenSettings = jest.fn();

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockRequest(...args),
  watchPositionAsync: (...args: unknown[]) => mockWatch(...args),
}));

jest.mock('expo-linking', () => ({
  openSettings: (...args: unknown[]) => mockOpenSettings(...args),
}));

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: jest.fn(() => null), setItemSync: jest.fn(), removeItemSync: jest.fn() },
}));

const Storage = (
  jest.requireMock('expo-sqlite/kv-store') as {
    default: {
      getItemSync: jest.Mock;
      setItemSync: jest.Mock;
      removeItemSync: jest.Mock;
    };
  }
).default;

type Posicao = { coords: { latitude: number; longitude: number; accuracy: number | null } };
let emitirPosicao: ((posicao: Posicao) => void) | null = null;
let removerAssinatura: jest.Mock;

beforeEach(() => {
  escolherLocal(null);
  jest.clearAllMocks();
  emitirPosicao = null;
  removerAssinatura = jest.fn();
  mockRequest.mockResolvedValue({ status: 'granted', canAskAgain: true });
  mockWatch.mockImplementation(
    async (_opcoes: unknown, ouvinte: (posicao: Posicao) => void) => {
      emitirPosicao = ouvinte;
      return { remove: removerAssinatura };
    },
  );
});

describe('localização simulada', () => {
  it('lê um ponto e um trajeto, ignorando partes inválidas', () => {
    expect(lerSimulada('-23.5,-46.6')).toEqual({ latitude: -23.5, longitude: -46.6 });
    expect(lerSimulada('abc')).toBeNull();
    expect(lerTrajeto('-23.5,-46.6; x ;-23.6,-46.7')).toHaveLength(2);
  });

  it('percorre o trajeto e volta', () => {
    const pontos = [
      { latitude: 0, longitude: 0 },
      { latitude: 0.001, longitude: 0 }, // ~111 m ao norte
    ];
    expect(posicaoNoTrajeto(pontos, 0)).toEqual(pontos[0]);
    expect(posicaoNoTrajeto(pontos, 55.66).latitude).toBeCloseTo(0.0005, 4);
    // ida (111 m) + metade da volta → de novo no meio
    expect(posicaoNoTrajeto(pontos, 111.32 + 55.66).latitude).toBeCloseTo(0.0005, 4);
  });
});

describe('posicaoNaLinha', () => {
  const linha = [
    { latitude: 0, longitude: 0 },
    { latitude: 0.001, longitude: 0 },
    { latitude: 0.001, longitude: 0.001 },
  ];

  it('anda pela linha e para no último ponto', () => {
    expect(posicaoNaLinha(linha, 0)).toEqual(linha[0]);
    expect(posicaoNaLinha(linha, 55.66).latitude).toBeCloseTo(0.0005, 4);
    expect(posicaoNaLinha(linha, 10_000)).toEqual(linha[2]);
  });

  it('trata metros negativos como o início', () => {
    expect(posicaoNaLinha(linha, -5)).toEqual(linha[0]);
  });
});

describe('local escolhido', () => {
  const pinheiros = { latitude: -23.5, longitude: -46.6, nome: 'Pinheiros' };

  it('persiste e limpa o local escolhido', () => {
    escolherLocal(pinheiros);

    expect(Storage.setItemSync).toHaveBeenCalledWith(
      'localizacao.escolhido.v1',
      JSON.stringify(pinheiros),
    );

    escolherLocal(null);

    expect(Storage.removeItemSync).toHaveBeenCalledWith('localizacao.escolhido.v1');
  });

  it('useLocalEscolhido acompanha a escolha', async () => {
    const { result } = await renderHook(() => useLocalEscolhido());
    expect(result.current).toBeNull();

    await act(async () => {
      escolherLocal(pinheiros);
    });

    await waitFor(() => expect(result.current).toEqual(pinheiros));
  });

  it('usa o GPS quando não há local escolhido', async () => {
    escolherLocal(null);

    const { result } = await renderHook(() => useLocalizacao());
    await waitFor(() => expect(emitirPosicao).not.toBeNull());

    await act(async () => {
      emitirPosicao!({ coords: { latitude: -23.55, longitude: -46.65, accuracy: 8 } });
    });

    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(result.current).toMatchObject({
      status: 'ok',
      coords: { latitude: -23.55, longitude: -46.65 },
      simulada: false,
    });
    if (result.current.status === 'ok') expect(result.current.escolhida).toBeFalsy();
  });

  it('o local escolhido vale mesmo com o GPS funcionando', async () => {
    escolherLocal(pinheiros);

    const { result } = await renderHook(() => useLocalizacao());
    await waitFor(() => expect(emitirPosicao).not.toBeNull());

    await act(async () => {
      emitirPosicao!({ coords: { latitude: -23.55, longitude: -46.65, accuracy: 8 } });
    });

    expect(result.current).toMatchObject({ status: 'ok', escolhida: true, nome: 'Pinheiros' });
  });

  it('cai para o escolhido quando a permissão é negada', async () => {
    mockRequest.mockResolvedValue({ status: 'denied', canAskAgain: true });
    escolherLocal(pinheiros);

    const { result } = await renderHook(() => useLocalizacao());

    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(result.current).toMatchObject({
      status: 'ok',
      coords: { latitude: -23.5, longitude: -46.6 },
      precisaoM: null,
      simulada: false,
      escolhida: true,
      nome: 'Pinheiros',
    });
    expect(mockWatch).not.toHaveBeenCalled();
  });

  it('cai para o escolhido quando o GPS está indisponível', async () => {
    mockWatch.mockRejectedValue(new Error('sem GPS'));
    escolherLocal(pinheiros);

    const { result } = await renderHook(() => useLocalizacao());

    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(result.current).toMatchObject({ status: 'ok', escolhida: true, nome: 'Pinheiros' });
  });

  it('fica negada sem permissão e sem escolhido', async () => {
    mockRequest.mockResolvedValue({ status: 'denied', canAskAgain: true });

    const { result } = await renderHook(() => useLocalizacao());

    await waitFor(() => expect(result.current.status).toBe('negada'));
  });

  it('depois de conceder, pedirPermissao faz o hook observar o GPS', async () => {
    mockRequest.mockResolvedValue({ status: 'denied', canAskAgain: true });

    const { result } = await renderHook(() => useLocalizacao());
    await waitFor(() => expect(result.current.status).toBe('negada'));

    mockRequest.mockResolvedValue({ status: 'granted', canAskAgain: true });
    await act(async () => {
      await pedirPermissao();
    });

    await waitFor(() => expect(emitirPosicao).not.toBeNull());
    await act(async () => {
      emitirPosicao!({ coords: { latitude: -23.55, longitude: -46.65, accuracy: 8 } });
    });

    await waitFor(() => expect(result.current.status).toBe('ok'));
    if (result.current.status === 'ok') expect(result.current.escolhida).toBeFalsy();
  });

  it('abre os ajustes quando não pode pedir a permissão de novo', async () => {
    mockRequest.mockResolvedValue({ status: 'denied', canAskAgain: false });

    await pedirPermissao();

    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });
});
