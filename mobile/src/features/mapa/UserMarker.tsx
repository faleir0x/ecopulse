import { StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';

import type { Coordenada } from '@/features/localizacao';
import { useTema } from '@/theme/tema';

/** Ponto "você": círculo `accent` com anel em `background`. */
export function UserMarker({ coordenada }: { coordenada: Coordenada }) {
  const { cor } = useTema();

  return (
    <Marker
      coordinate={coordenada}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
      accessible={false}
      accessibilityElementsHidden
    >
      <View style={styles.area}>
        <View style={[styles.ponto, { backgroundColor: cor.accent, borderColor: cor.background }]} />
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  area: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ponto: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
  },
});
