import { useMutation } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { ApiErro, calcularRota } from '@/api/cliente';
import type { ModoRota, RotaSegura } from '@/domain/tipos';
import type { Coordenada } from '@/features/localizacao';

/**
 * Estado da rota segura no Mapa.
 * - destino: escolhendo o ponto (toque no mapa) e o modo
 * - resultado: rota calculada, sheet aberta com o resumo
 * - seguindo: sheet recolhida, só a linha da rota e o resumo curto
 */
export type FaseRota = 'destino' | 'resultado' | 'seguindo';

export type RotaSeguraEstado = {
  fase: FaseRota;
  destino: Coordenada | null;
  modo: ModoRota;
  rota: RotaSegura | null;
  calculando: boolean;
  erro: ApiErro | null;
  /** Trocar destino ou modo descarta a rota calculada e volta para "destino". */
  setDestino: (destino: Coordenada | null) => void;
  setModo: (modo: ModoRota) => void;
  calcular: () => void;
  seguir: () => void;
  /** "resultado"/"seguindo" → "destino" (mantém o destino); usado pelo voltar. */
  voltar: () => void;
  /** Sai do modo rota: limpa tudo. */
  limpar: () => void;
};

export function useRotaSegura(origem: Coordenada | null): RotaSeguraEstado {
  const [fase, setFase] = useState<FaseRota>('destino');
  const [destino, setDestinoEstado] = useState<Coordenada | null>(null);
  const [modo, setModoEstado] = useState<ModoRota>('pedestre');

  const calculo = useMutation<RotaSegura, ApiErro, { origem: Coordenada; destino: Coordenada; modo: ModoRota }>({
    mutationFn: (p) => calcularRota(p.origem, p.destino, p.modo),
    onSuccess: () => setFase('resultado'),
  });
  const { reset, mutate } = calculo;

  const setDestino = useCallback(
    (novo: Coordenada | null) => {
      reset();
      setFase('destino');
      setDestinoEstado(novo);
    },
    [reset],
  );

  const setModo = useCallback(
    (novo: ModoRota) => {
      reset();
      setFase('destino');
      setModoEstado(novo);
    },
    [reset],
  );

  const calcular = useCallback(() => {
    if (!origem || !destino) return;
    mutate({ origem, destino, modo });
  }, [origem, destino, modo, mutate]);

  const seguir = useCallback(() => setFase('seguindo'), []);

  const voltar = useCallback(() => {
    reset();
    setFase('destino');
  }, [reset]);

  const limpar = useCallback(() => {
    reset();
    setFase('destino');
    setDestinoEstado(null);
    setModoEstado('pedestre');
  }, [reset]);

  return {
    fase,
    destino,
    modo,
    rota: fase === 'destino' ? null : (calculo.data ?? null),
    calculando: calculo.isPending,
    erro: calculo.error ?? null,
    setDestino,
    setModo,
    calcular,
    seguir,
    voltar,
    limpar,
  };
}
