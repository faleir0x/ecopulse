import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { buscarOcorrencia, confirmarOcorrencia, resolverOcorrencia, listarOcorrencias } from '@/api/cliente';
import { idAparelho } from '@/data/aparelho';
import type { Ocorrencia, OcorrenciaDetalhe, TipoRisco } from '@/domain/tipos';
import type { Bbox } from '@/lib/geohash';
import { randomUUID } from 'expo-crypto';

/** Arredonda o bbox (~110 m) para a chave do cache não mudar a cada pixel de arraste. */
function chaveBbox(b: Bbox): string {
  const r = (n: number) => n.toFixed(3);
  return `${r(b.lonMin)},${r(b.latMin)},${r(b.lonMax)},${r(b.latMax)}`;
}

export function useOcorrencias(bbox: Bbox | null, tipo: TipoRisco | null) {
  return useQuery({
    queryKey: ['ocorrencias', bbox ? chaveBbox(bbox) : null, tipo],
    queryFn: ({ signal }) => listarOcorrencias(bbox!, tipo, { signal }),
    enabled: bbox !== null,
    staleTime: 15_000,
    // Rede de segurança: o WebSocket (4.5) atualiza na hora; isto cobre conexão caída
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useDetalhe(id: number | null) {
  return useQuery({
    queryKey: ['ocorrencia', id],
    queryFn: ({ signal }) => buscarOcorrencia(id!, { signal }),
    enabled: id !== null,
    staleTime: 10_000,
  });
}

/**
 * "Ainda está": otimista (soma 1 e acrescenta "agora" na linha do tempo na hora); em erro,
 * volta ao valor anterior. O valor real chega depois pelo evento/refetch.
 */
export function useConfirmar(id: number) {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: () =>
      confirmarOcorrencia(id, {
        client_id: randomUUID(),
        device_id: idAparelho(),
        registrado_em: new Date().toISOString(),
      }),
    onMutate: async () => {
      await cliente.cancelQueries({ queryKey: ['ocorrencia', id] });
      const anterior = cliente.getQueryData<OcorrenciaDetalhe>(['ocorrencia', id]);
      if (anterior) {
        cliente.setQueryData<OcorrenciaDetalhe>(['ocorrencia', id], {
          ...anterior,
          confirmacoes: anterior.confirmacoes + 1,
          linha_do_tempo: [...anterior.linha_do_tempo, new Date().toISOString()],
        });
      }
      return { anterior };
    },
    onError: (_erro, _vars, contexto) => {
      if (contexto?.anterior) cliente.setQueryData(['ocorrencia', id], contexto.anterior);
    },
    onSettled: () => {
      void cliente.invalidateQueries({ queryKey: ['ocorrencias'] });
    },
  });
}

/**
 * "Já passou": cada aparelho conta uma vez no servidor; com marcas suficientes a ocorrência
 * encerra e o evento ocorrencia.expirada a tira do mapa. O id vai no mutate (não no hook).
 */
export function useResolver() {
  const cliente = useQueryClient();
  return useMutation({
    mutationFn: (id: number) =>
      resolverOcorrencia(id, {
        client_id: randomUUID(),
        device_id: idAparelho(),
        registrado_em: new Date().toISOString(),
      }),
    onSettled: (_dados, _erro, id) => {
      void cliente.invalidateQueries({ queryKey: ['ocorrencias'] });
      void cliente.invalidateQueries({ queryKey: ['ocorrencia', id] });
    },
  });
}

export type { Ocorrencia };
