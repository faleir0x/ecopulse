import type { Coordenada } from '@/features/localizacao';

import type { RotaSeguraEstado } from './useRotaSegura';

export type RotaConteudoProps = {
  estado: RotaSeguraEstado;
  origem: Coordenada;
  /** Voltar no cabeçalho: na fase "destino" sai do modo rota; nas outras, estado.voltar(). */
  onSair: () => void;
};

/** Conteúdo da MapSheet no modo rota (prancha: Rota-destino, Main, Rota-sem-alternativa). */
export function RotaConteudo({ estado, origem, onSair }: RotaConteudoProps) {
  // TODO(worker)
  return null;
}
