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
 * Células ambientais do retângulo visível. Desligada quando a camada é "nenhuma"; busca a cada
 * 5 s enquanto o servidor informa células pendentes (X-Celulas-Pendentes > 0) e a cada 60 s
 * quando a camada já está completa (o cache da API e o coletor trabalham nessa janela).
 */
export function useCamada(bbox: Bbox | null, ativa: boolean) {
  return useQuery({
    queryKey: ['camada', bbox ? chaveBbox(bbox) : null],
    queryFn: ({ signal }) => lerCamada(bbox!, { signal }),
    enabled: ativa && bbox !== null,
    staleTime: 60_000,
    // O select mantém TelaMapa recebendo só as células; a query guarda também o contador.
    select: (dados) => dados.celulas,
    // `keepPreviousData` mantém as células da área anterior só enquanto o novo pedido está
    // pendente. Em erro o react-query v5 não aplica o placeholder (status "error"), então a
    // camada é descartada em vez de continuar mostrando o retângulo antigo.
    refetchInterval: (query) =>
      (query.state.data?.pendentes ?? 0) > 0 ? 5_000 : 60_000,
    placeholderData: keepPreviousData,
  });
}
