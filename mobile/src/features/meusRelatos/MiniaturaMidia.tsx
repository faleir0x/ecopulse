import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';

import type { MidiaLocal } from '@/data/outbox';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { raio } from '@/theme/tokens';

export type MiniaturaMidiaProps = {
  midia: MidiaLocal;
  indice: number;
  onPress: () => void;
};

export function MiniaturaMidia({ midia, indice, onPress }: MiniaturaMidiaProps) {
  const { cor } = useTema();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Abrir ${midia.tipo === 'video' ? 'vídeo' : 'foto'} ${indice + 1}`}
      style={[styles.base, { backgroundColor: cor.surfaceMuted }]}
    >
      {midia.tipo === 'video' ? (
        <View style={[styles.video, { backgroundColor: cor.surfaceStrong }]}>
          <Icon name="play" peso="bold" tamanho={14} cor="#FFFFFF" />
        </View>
      ) : (
        <Image source={{ uri: midia.uri }} style={styles.imagem} contentFit="cover" />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 48,
    height: 48,
    borderRadius: raio.tile,
    overflow: 'hidden',
  },
  imagem: {
    width: '100%',
    height: '100%',
  },
  video: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
