import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { lerCamada } from '@/api/cliente';
import type { Bbox } from '@/lib/geohash';

export type Camada = 'nenhuma' | 'calor' | 'ar';

/** Mesmo arredondamento do bbox das ocorrências: a chave do cache não muda a cada pixel. */
function chaveBbox(b: Bbox): string {
  const r = (n: number) => n.toFixed(3);
  return `${r(b.lonMin)},${r(b.latMin)},${r(b.lonMax)},${r(b.latMax)}`;
}

/**
 * Células ambientais do retângulo visível. Desligada quando a camada é "nenhuma"; atualiza
 * a cada 60 s (o cache da API e o coletor do environment também trabalham nessa janela).
 */
export function useCamada(bbox: Bbox | null, ativa: boolean) {
  return useQuery({
    queryKey: ['camada', bbox ? chaveBbox(bbox) : null],
    queryFn: ({ signal }) => lerCamada(bbox!, { signal }),
    enabled: ativa && bbox !== null,
    staleTime: 60_000,
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}
