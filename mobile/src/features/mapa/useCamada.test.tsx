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
  return renderHook(() => useCamada(BBOX, ativa), { wrapper });
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
    lerCamadaMock.mockResolvedValue([CELULA]);

    const { result } = await montar(true);

    await waitFor(() => expect(result.current.data).toEqual([CELULA]));
    expect(lerCamadaMock).toHaveBeenCalledWith(BBOX, expect.anything());
  });
});
