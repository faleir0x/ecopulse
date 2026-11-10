import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { enviarTelemetria } from '@/api/cliente';
import type { EstadoLocalizacao } from '@/features/localizacao';

import {
  INTERVALO_MINIMO_ENVIO_MS,
  INTERVALO_TELEMETRIA_MS,
  useTelemetria,
} from './telemetria';

jest.mock('@/api/cliente', () => ({ enviarTelemetria: jest.fn() }));
jest.mock('@/data/aparelho', () => ({ idAparelho: () => 'aparelho-1' }));
jest.mock('@/features/localizacao', () => ({
  useLocalizacao: () => mockEstadoLocalizacao,
}));

const enviarMock = enviarTelemetria as jest.MockedFunction<typeof enviarTelemetria>;

const BASE = { latitude: -23.55, longitude: -46.65 };
const AGORA = new Date('2026-11-10T12:00:00.000Z');

let mockEstadoLocalizacao: EstadoLocalizacao;

function estadoReal(parcial: Partial<Extract<EstadoLocalizacao, { status: 'ok' }>> = {}) {
  return {
    status: 'ok' as const,
    coords: BASE,
    precisaoM: 12,
    simulada: false,
    ...parcial,
  };
}

async function montar() {
  const resultado = await renderHook(() => useTelemetria());
  await act(async () => {
    await Promise.resolve();
  });
  return resultado;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(AGORA);
  AppState.currentState = 'active';
  enviarMock.mockReset();
  enviarMock.mockResolvedValue(undefined);
  mockEstadoLocalizacao = estadoReal();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('useTelemetria', () => {
  it('envia ao ter a primeira posição real', async () => {
    await montar();

    expect(enviarMock).toHaveBeenCalledTimes(1);
    expect(enviarMock).toHaveBeenCalledWith({
      device_id: 'aparelho-1',
      latitude: BASE.latitude,
      longitude: BASE.longitude,
      precisao_m: 12,
      registrado_em: '2026-11-10T12:00:00.000Z',
    });
  });

  it('não envia com local escolhido ou posição simulada', async () => {
    mockEstadoLocalizacao = estadoReal({ escolhida: true });
    const { rerender } = await montar();
    expect(enviarMock).not.toHaveBeenCalled();

    mockEstadoLocalizacao = estadoReal({ simulada: true });
    await rerender(undefined);
    expect(enviarMock).not.toHaveBeenCalled();
  });

  it('reenvia depois de 5 minutos', async () => {
    await montar();
    expect(enviarMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(INTERVALO_TELEMETRIA_MS);
    });

    expect(enviarMock).toHaveBeenCalledTimes(2);
  });

  it('reenvia ao andar mais de 300 m', async () => {
    const { rerender } = await montar();
    expect(enviarMock).toHaveBeenCalledTimes(1);

    // Passa a proteção de rajada antes de andar (~445 m ao norte)
    await act(async () => {
      jest.advanceTimersByTime(INTERVALO_MINIMO_ENVIO_MS + 1_000);
    });
    mockEstadoLocalizacao = estadoReal({
      coords: { latitude: BASE.latitude + 0.004, longitude: BASE.longitude },
    });
    await rerender(undefined);

    expect(enviarMock).toHaveBeenCalledTimes(2);
  });

  it('não envia duas vezes no mesmo minuto', async () => {
    const { rerender } = await montar();
    expect(enviarMock).toHaveBeenCalledTimes(1);

    mockEstadoLocalizacao = estadoReal({
      coords: { latitude: BASE.latitude + 0.005, longitude: BASE.longitude },
    });
    await rerender(undefined);

    expect(enviarMock).toHaveBeenCalledTimes(1);
  });

  it('para o intervalo ao desmontar', async () => {
    const { unmount } = await montar();
    expect(enviarMock).toHaveBeenCalledTimes(1);

    await unmount();
    await act(async () => {
      jest.advanceTimersByTime(INTERVALO_TELEMETRIA_MS * 2);
    });

    expect(enviarMock).toHaveBeenCalledTimes(1);
  });

  it('reenvia ao voltar ao primeiro plano com o último envio velho', async () => {
    let ouvinte: ((estado: AppStateStatus) => void) | null = null;
    const remover = jest.fn();
    const escuta = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_tipo, aoMudar) => {
        ouvinte = aoMudar;
        return { remove: remover };
      });

    await montar();
    expect(enviarMock).toHaveBeenCalledTimes(1);

    // Em segundo plano o intervalo não envia; ao voltar, o sinal velho é renovado
    await act(async () => {
      ouvinte?.('background');
    });
    await act(async () => {
      jest.advanceTimersByTime(INTERVALO_TELEMETRIA_MS);
    });
    expect(enviarMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      ouvinte?.('active');
    });
    expect(enviarMock).toHaveBeenCalledTimes(2);

    escuta.mockRestore();
  });
});
