import { StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';

import type { Coordenada } from '@/features/localizacao';
import { useRedesenhoInicial } from '@/features/mapa/useRedesenhoInicial';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';

export type DestinoMarkerProps = { coordenada: Coordenada };

/** Bandeira do destino (filho do MapView). */
export function DestinoMarker({ coordenada }: DestinoMarkerProps) {
  const { cor } = useTema();
  const redesenhar = useRedesenhoInicial();

  return (
    <Marker
      coordinate={coordenada}
      anchor={{ x: 0.5, y: 1 }}
      tracksViewChanges={redesenhar}
      accessible={false}
      accessibilityElementsHidden
    >
      <View style={styles.area}>
        <View style={[styles.circulo, { backgroundColor: cor.ink }]}>
          <Icon name="flag" tamanho={20} cor={cor.onInk} />
        </View>
        <View style={[styles.haste, { backgroundColor: cor.ink }]} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  // Sobra lateral/topo: no Android o marcador vira bitmap do tamanho da view.
  area: {
    width: 60,
    height: 56,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  circulo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  haste: {
    width: 2,
    height: 14,
  },
});
