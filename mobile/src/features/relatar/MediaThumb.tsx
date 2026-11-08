import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import type { MidiaLocal } from '@/data/outbox';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { raio } from '@/theme/tokens';

export type MediaThumbProps = {
  midia: MidiaLocal;
  indice: number;
  tamanho?: number;
  removivel?: boolean;
  onRemover?: (indice: number) => void;
  onAbrir: (indice: number) => void;
};

export function MediaThumb({
  midia,
  indice,
  tamanho = 64,
  removivel = true,
  onRemover,
  onAbrir,
}: MediaThumbProps) {
  const { cor, reduzirMovimento } = useTema();
  const escala = useSharedValue(reduzirMovimento ? 1 : 0);
  const borda = Math.round(tamanho * (14 / 64));
  const podeRemover = removivel && onRemover !== undefined;

  useEffect(() => {
    if (reduzirMovimento) {
      escala.value = 1;
      return;
    }
    escala.value = withSpring(1, {
      damping: 12,
      stiffness: 180,
      mass: 0.8,
    });
  }, [reduzirMovimento, escala]);

  const estiloPop = useAnimatedStyle(() => ({ transform: [{ scale: escala.value }] }));

  return (
    <Animated.View style={[styles.caixa, { width: tamanho, height: tamanho }, estiloPop]}>
      <Pressable
        onPress={() => onAbrir(indice)}
        accessibilityRole="button"
        accessibilityLabel={`Abrir ${midia.tipo === 'video' ? 'vídeo' : 'foto'} ${indice + 1}`}
        style={[
          styles.miniatura,
          { width: tamanho, height: tamanho, borderRadius: borda, backgroundColor: cor.surfaceMuted },
        ]}
      >
        {midia.tipo === 'video' ? (
          <View style={[styles.video, { backgroundColor: cor.surfaceStrong }]}>
            <Icon name="play" peso="bold" tamanho={14} cor="#FFFFFF" />
          </View>
        ) : (
          <Image source={{ uri: midia.uri }} style={styles.imagem} contentFit="cover" />
        )}
      </Pressable>
      {podeRemover ? (
        <Pressable
          onPress={() => onRemover(indice)}
          accessibilityRole="button"
          accessibilityLabel="Remover mídia"
          hitSlop={0}
          style={styles.remover}
        >
          <View style={[styles.removerCirculo, { backgroundColor: cor.textPrimary }]}>
            <Icon name="close" tamanho={14} cor={cor.background} />
          </View>
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  caixa: {},
  miniatura: {
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
  remover: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removerCirculo: {
    width: 22,
    height: 22,
    borderRadius: raio.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
});
