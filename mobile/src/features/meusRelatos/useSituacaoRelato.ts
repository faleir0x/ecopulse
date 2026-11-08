import { QueryClientContext, useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useContext } from 'react';

import { buscarSituacaoRelato } from '@/api/cliente';
import type { StatusRelato } from '@/data/outbox';
import type { SituacaoRelato } from '@/domain/tipos';

export type ConsultaSituacao = Pick<
  UseQueryResult<SituacaoRelato | null>,
  'data' | 'isPending' | 'isSuccess'
>;

const SEM_CONSULTA: ConsultaSituacao = { data: undefined, isPending: false, isSuccess: false };

/**
 * Situação do relato no servidor. Só consulta enviados e encerrados: pendente ainda está na
 * fila e rejeitado nunca chegou a virar ocorrência.
 */
export function useSituacaoRelato(clientId: string, status: StatusRelato): ConsultaSituacao {
  const clienteQuery = useContext(QueryClientContext);

  // Sem provider (testes isolados da linha) não há como consultar; segue sem situação.
  if (clienteQuery === undefined) return SEM_CONSULTA;

  // A presença do provider é fixa durante a vida do componente.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useQuery({
    queryKey: ['situacao-relato', clientId],
    queryFn: ({ signal }) => buscarSituacaoRelato(clientId, { signal }),
    enabled: status === 'enviado' || status === 'encerrado',
    staleTime: 15_000,
  });
}
