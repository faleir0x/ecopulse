import { Polygon } from 'react-native-maps';

import type { CelulaAmbiente } from '@/domain/tipos';
import { corNaEscala, nivelAqi } from '@/features/agora/escalas';
import { useTema } from '@/theme/tema';
import type { PaletaSeveridade } from '@/theme/tokens';

import { comAlfa } from './cor';
import type { Camada } from './useCamada';

const OPACIDADE_CELULA = 0.3;

/** Cor de preenchimento de uma célula (null = sem leitura para a camada). Função pura. */
export function corDaCelula(
  celula: CelulaAmbiente,
  camada: Camada,
  sev: PaletaSeveridade,
): string | null {
  if (camada === 'calor') {
    return celula.temperatura === null
      ? null
      : comAlfa(corNaEscala(celula.temperatura), OPACIDADE_CELULA);
  }
  if (camada === 'ar') {
    const nivel = nivelAqi(celula.aqi);
    return nivel === null ? null : comAlfa(sev.fill[nivel], OPACIDADE_CELULA);
  }
  return null;
}

export type CamadaAmbientalProps = {
  celulas: CelulaAmbiente[];
  camada: Camada;
};

/** Pintura das células geohash5 no mapa. Deve ficar antes dos marcadores no JSX. */
export function CamadaAmbiental({ celulas, camada }: CamadaAmbientalProps) {
  const { sev } = useTema();

  if (camada === 'nenhuma') return null;

  return (
    <>
      {celulas.map((celula) => {
        const cor = corDaCelula(celula, camada, sev);
        if (cor === null) return null;
        return (
          <Polygon
            key={celula.geohash}
            coordinates={[
              { latitude: celula.lat_min, longitude: celula.lon_min },
              { latitude: celula.lat_min, longitude: celula.lon_max },
              { latitude: celula.lat_max, longitude: celula.lon_max },
              { latitude: celula.lat_max, longitude: celula.lon_min },
            ]}
            strokeColor="transparent"
            strokeWidth={0}
            fillColor={cor}
            zIndex={0}
          />
        );
      })}
    </>
  );
}
