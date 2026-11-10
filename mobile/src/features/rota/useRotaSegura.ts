import { useMutation } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';

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
  // Cada cálculo leva um token; trocar destino/modo/sair invalida os que estão no ar
  const tokenRef = useRef(0);
  const invalidarCalculo = useCallback(() => {
    tokenRef.current += 1;
  }, []);

  const calculo = useMutation<
    RotaSegura,
    ApiErro,
    { origem: Coordenada; destino: Coordenada; modo: ModoRota; token: number }
  >({
    mutationFn: (p) => calcularRota(p.origem, p.destino, p.modo),
    onSuccess: (_rota, variaveis) => {
      // Só a resposta do cálculo mais recente muda a fase: a de um cálculo antigo é ignorada
      if (variaveis.token === tokenRef.current) setFase('resultado');
    },
  });
  const { reset, mutate } = calculo;

  const setDestino = useCallback(
    (novo: Coordenada | null) => {
      invalidarCalculo();
      reset();
      setFase('destino');
      setDestinoEstado(novo);
    },
    [invalidarCalculo, reset],
  );

  const setModo = useCallback(
    (novo: ModoRota) => {
      invalidarCalculo();
      reset();
      setFase('destino');
      setModoEstado(novo);
    },
    [invalidarCalculo, reset],
  );

  const calcular = useCallback(() => {
    if (!origem || !destino) return;
    const token = tokenRef.current + 1;
    tokenRef.current = token;
    mutate({ origem, destino, modo, token });
  }, [origem, destino, modo, mutate]);

  const seguir = useCallback(() => setFase('seguindo'), []);

  const voltar = useCallback(() => {
    invalidarCalculo();
    reset();
    setFase('destino');
  }, [invalidarCalculo, reset]);

  const limpar = useCallback(() => {
    invalidarCalculo();
    reset();
    setFase('destino');
    setDestinoEstado(null);
    setModoEstado('pedestre');
  }, [invalidarCalculo, reset]);

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
