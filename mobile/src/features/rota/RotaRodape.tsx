import type { RotaSeguraEstado } from './useRotaSegura';

export type RotaRodapeProps = {
  estado: RotaSeguraEstado;
  onSair: () => void;
};

/** Botões fixos no rodapé da MapSheet no modo rota. */
export function RotaRodape({ estado, onSair }: RotaRodapeProps) {
  // TODO(worker)
  return null;
}
