import { StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';

import { T } from '@/components';
import { familia } from '@/theme/fontes';
import { useTema } from '@/theme/tema';
import { marcador, texto } from '@/theme/tokens';

import type { Grupo } from './agrupar';
import { useRedesenhoInicial } from './useRedesenhoInicial';

export type ClusterMarkerProps = {
  grupo: Grupo;
  onPress: () => void;
};

/** Círculo `surface` com anel na cor da pior severidade e a quantidade no centro. */
export function ClusterMarker({ grupo, onPress }: ClusterMarkerProps) {
  const { cor, sev } = useTema();
  const quantidade = grupo.ocorrencias.length;
  const tamanho = tamanhoDoGrupo(quantidade);
  // Folga em volta: no Android o marcador vira bitmap do tamanho da view (corta bordas justas)
  const lado = Math.max(marcador.areaToque, tamanho + 10);
  const redesenhar = useRedesenhoInicial();

  return (
    <Marker
      coordinate={{ latitude: grupo.latitude, longitude: grupo.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={redesenhar}
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${quantidade} ocorrências`}
    >
      <View style={[styles.area, { width: lado, height: lado }]}>
        <View
          style={[
            styles.circulo,
            {
              width: tamanho,
              height: tamanho,
              borderRadius: tamanho / 2,
              backgroundColor: cor.surface,
              borderColor: sev.fill[grupo.pior],
            },
          ]}
        >
          <T
            estilo="headline"
            style={[
              styles.numero,
              {
                fontFamily: familia(texto.title),
                fontSize: texto.headline.tamanho,
                lineHeight: texto.headline.alturaLinha,
              },
            ]}
          >
            {quantidade}
          </T>
        </View>
      </View>
    </Marker>
  );
}

/** Tamanho cresce com a quantidade: 40 / 44 / 48 / 56 dp. */
function tamanhoDoGrupo(quantidade: number): number {
  if (quantidade <= 2) return 40;
  if (quantidade <= 4) return 44;
  if (quantidade <= 9) return 48;
  return 56;
}

const styles = StyleSheet.create({
  area: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  circulo: {
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numero: {
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
