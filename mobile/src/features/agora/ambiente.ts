import { useQuery } from '@tanstack/react-query';

import { lerAmbiente } from '@/api/cliente';
import type { Coordenada } from '@/features/localizacao';

/**
 * Leitura da célula do usuário. Sem leitura (null) tenta de novo a cada 15 s até o
 * environment coletar; com leitura, atualiza a cada 5 min (o environment coleta a cada 10).
 */
export function useAmbiente(coords: Coordenada | null) {
  return useQuery({
    queryKey: ['ambiente', coords ? `${coords.latitude.toFixed(3)},${coords.longitude.toFixed(3)}` : null],
    queryFn: ({ signal }) => lerAmbiente(coords!.latitude, coords!.longitude, { signal }),
    enabled: coords !== null,
    staleTime: 60_000,
    refetchInterval: (consulta) => (consulta.state.data === null ? 15_000 : 5 * 60_000),
  });
}
