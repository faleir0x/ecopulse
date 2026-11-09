import { useMemo } from 'react';
import { Overlay } from 'react-native-maps';

import type { CelulaAmbiente } from '@/domain/tipos';
import { useTema } from '@/theme/tema';

import { montarSuperficie, type Superficie } from './superficie';
import type { Camada } from './useCamada';

/** Superfície interpolada da camada ativa (null com a camada "nenhuma" ou sem leitura). */
export function useSuperficie(celulas: CelulaAmbiente[], camada: Camada): Superficie | null {
  const { sev } = useTema();
  return useMemo(
    () => (camada === 'nenhuma' ? null : montarSuperficie(celulas, camada, sev)),
    [celulas, camada, sev],
  );
}

export type CamadaAmbientalProps = {
  superficie: Superficie | null;
};

/** Imagem da superfície esticada sobre as células. Deve ficar antes dos marcadores no JSX. */
export function CamadaAmbiental({ superficie }: CamadaAmbientalProps) {
  if (!superficie) return null;
  return <Overlay image={{ uri: superficie.uri }} bounds={superficie.limites} />;
}
