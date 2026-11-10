import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { calcularRota } from '@/api/cliente';
import type { RotaSegura } from '@/domain/tipos';
import type { Coordenada } from '@/features/localizacao';

import { useRotaSegura } from './useRotaSegura';

jest.mock('@/api/cliente', () => ({ calcularRota: jest.fn() }));

const calcularRotaMock = calcularRota as jest.MockedFunction<typeof calcularRota>;

const ORIGEM: Coordenada = { latitude: -23.56, longitude: -46.65 };
const DESTINO_A: Coordenada = { latitude: -23.57, longitude: -46.66 };
const DESTINO_B: Coordenada = { latitude: -23.58, longitude: -46.67 };

const ROTA: RotaSegura = {
  modo: 'pedestre',
  distancia_m: 1400,
  duracao_s: 840,
  coordenadas: [
    [-23.56, -46.65],
    [-23.57, -46.66],
  ],
  evitadas: [],
  no_caminho: [],
  sem_desvio: false,
  direta: null,
  aviso: null,
};

type Diferida<T> = {
  promessa: Promise<T>;
  resolver: (valor: T) => void;
  rejeitar: (erro: unknown) => void;
};

function diferida<T>(): Diferida<T> {
  let resolver!: (valor: T) => void;
  let rejeitar!: (erro: unknown) => void;
  const promessa = new Promise<T>((resolverPromessa, rejeitarPromessa) => {
    resolver = resolverPromessa;
    rejeitar = rejeitarPromessa;
  });
  return { promessa, resolver, rejeitar };
}

async function montar(origem: Coordenada | null = ORIGEM) {
  const cliente = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(() => useRotaSegura(origem), { wrapper });
  return { result, cliente };
}

beforeEach(() => {
  calcularRotaMock.mockReset();
});

describe('useRotaSegura', () => {
  it('resposta de um cálculo antigo depois de trocar o destino não muda a fase', async () => {
    const antiga = diferida<RotaSegura>();
    calcularRotaMock.mockReturnValueOnce(antiga.promessa);

    const { result } = await montar();
    await act(() => result.current.setDestino(DESTINO_A));
    await act(() => result.current.calcular());

    await waitFor(() => expect(calcularRotaMock).toHaveBeenCalledTimes(1));
    expect(result.current.calculando).toBe(true);

    await act(() => result.current.setDestino(DESTINO_B));
    expect(result.current.fase).toBe('destino');

    await act(async () => {
      antiga.resolver(ROTA);
      await antiga.promessa;
    });

    expect(result.current.fase).toBe('destino');
    expect(result.current.rota).toBeNull();
  });

  it('só aceita a resposta do cálculo mais recente', async () => {
    const primeira = diferida<RotaSegura>();
    const segunda = diferida<RotaSegura>();
    calcularRotaMock
      .mockReturnValueOnce(primeira.promessa)
      .mockReturnValueOnce(segunda.promessa);

    const { result } = await montar();
    await act(() => result.current.setDestino(DESTINO_A));
    await act(() => result.current.calcular());
    await waitFor(() => expect(calcularRotaMock).toHaveBeenCalledTimes(1));

    await act(() => result.current.setDestino(DESTINO_B));
    await act(() => result.current.calcular());
    await waitFor(() => expect(calcularRotaMock).toHaveBeenCalledTimes(2));

    await act(async () => {
      primeira.resolver(ROTA);
      await primeira.promessa;
    });
    expect(result.current.fase).toBe('destino');

    await act(async () => {
      segunda.resolver(ROTA);
      await segunda.promessa;
    });
    expect(result.current.fase).toBe('resultado');
  });
});
