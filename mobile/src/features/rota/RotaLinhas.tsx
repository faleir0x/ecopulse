import type { RotaSegura } from '@/domain/tipos';

export type RotaLinhasProps = {
  rota: RotaSegura;
  /** Linha pontilhada da direta (só no resultado, quando houve desvio). */
  mostrarDireta: boolean;
};

/** Polylines da rota (filhas do MapView). */
export function RotaLinhas({ rota, mostrarDireta }: RotaLinhasProps) {
  // TODO(worker)
  return null;
}
