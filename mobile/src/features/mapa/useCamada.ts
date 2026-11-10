import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';

import { lerCamada } from '@/api/cliente';
import type { Bbox } from '@/lib/geohash';

export type Camada = 'nenhuma' | 'calor' | 'ar';

type RespostaCamada = Awaited<ReturnType<typeof lerCamada>>;

/** Mesmo arredondamento do bbox das ocorrências: a chave do cache não muda a cada pixel. */
function chaveBbox(b: Bbox): string {
  const r = (n: number) => n.toFixed(3);
  return `${r(b.lonMin)},${r(b.latMin)},${r(b.lonMax)},${r(b.latMax)}`;
}

/**
 * Células ambientais do retângulo visível. Desligada quando a camada é "nenhuma"; busca a cada
 * 5 s enquanto o servidor informa células pendentes (X-Celulas-Pendentes > 0) e a cada 60 s
 * quando a camada já está completa (o cache da API e o coletor trabalham nessa janela).
 * Se um pedido falhar (rede instável, limite da API), continua mostrando a última camada que
 * carregou em vez de apagar o mapa; o próximo pedido bem-sucedido substitui.
 */
export function useCamada(bbox: Bbox | null, ativa: boolean) {
  const consulta = useQuery({
    queryKey: ['camada', bbox ? chaveBbox(bbox) : null],
    queryFn: ({ signal }) => lerCamada(bbox!, { signal }),
    enabled: ativa && bbox !== null,
    staleTime: 60_000,
    // O select mantém TelaMapa recebendo só as células; a query guarda também o contador.
    select: (dados) => dados.celulas,
    // `keepPreviousData` mantém as células da área anterior enquanto o novo pedido está pendente
    refetchInterval: (query) =>
      (query.state.data?.pendentes ?? 0) > 0 ? 5_000 : 60_000,
    placeholderData: keepPreviousData,
  });

  const cliente = useQueryClient();
  let data = consulta.data;
  if (data === undefined && ativa && consulta.isError) {
    // A camada mais recente que carregou (de qualquer área) continua no cache do react-query
    const anteriores = cliente
      .getQueryCache()
      .findAll({ queryKey: ['camada'] })
      .filter((q) => q.state.data !== undefined)
      .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
    const resposta = anteriores[0]?.state.data as RespostaCamada | undefined;
    data = resposta?.celulas;
  }
  return { ...consulta, data };
}
