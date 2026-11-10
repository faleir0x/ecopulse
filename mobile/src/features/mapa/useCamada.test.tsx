import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { lerCamada } from '@/api/cliente';
import type { CelulaAmbiente } from '@/domain/tipos';
import type { Bbox } from '@/lib/geohash';

import { useCamada } from './useCamada';

jest.mock('@/api/cliente', () => ({ lerCamada: jest.fn() }));

const lerCamadaMock = lerCamada as jest.MockedFunction<typeof lerCamada>;

const BBOX: Bbox = { latMin: -23.6, lonMin: -46.7, latMax: -23.5, lonMax: -46.5 };

const CELULA: CelulaAmbiente = {
  geohash: '6gyf4',
  lat_min: -23.55,
  lon_min: -46.65,
  lat_max: -23.5,
  lon_max: -46.6,
  temperatura: 24,
  aqi: 35,
  medido_em: '2026-11-08T12:00:00Z',
};

async function montar(ativa: boolean) {
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cliente}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(() => useCamada(BBOX, ativa), { wrapper });
  return { result, cliente };
}

beforeEach(() => {
  lerCamadaMock.mockReset();
});

describe('useCamada', () => {
  it('fica desligado com a camada nenhuma', async () => {
    const { result } = await montar(false);

    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(lerCamadaMock).not.toHaveBeenCalled();
  });

  it('busca as células quando a camada está ativa', async () => {
    lerCamadaMock.mockResolvedValue({ celulas: [CELULA], pendentes: 0 });

    const { result } = await montar(true);

    await waitFor(() => expect(result.current.data).toEqual([CELULA]));
    expect(lerCamadaMock).toHaveBeenCalledWith(BBOX, expect.anything());
  });

  it('usa o contador do header para decidir o intervalo (5 s com pendentes)', async () => {
    lerCamadaMock.mockResolvedValue({ celulas: [], pendentes: 3 });

    const { result, cliente } = await montar(true);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);

    // A opção de intervalo recebe a query bruta (com o contador), não o dado do select.
    const consulta = cliente
      .getQueryCache()
      .find({ queryKey: ['camada', '-46.700,-23.600,-46.500,-23.500'] });
    const intervalo = (
      consulta?.options as unknown as {
        refetchInterval?: (query: unknown) => number;
      }
    )?.refetchInterval;

    expect(intervalo?.({ state: { data: { pendentes: 3 } } })).toBe(5_000);
    expect(intervalo?.({ state: { data: { pendentes: 0 } } })).toBe(60_000);
  });
});
