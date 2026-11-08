import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, movimento } from '@/theme/tokens';

import { T } from './T';

export type OfflinePillProps = {
  pendentes: number;
};

const DESLOCAMENTO = 110;
const CURVA_SAIDA = Easing.bezier(
  movimento.curvas.out[0],
  movimento.curvas.out[1],
  movimento.curvas.out[2],
  movimento.curvas.out[3],
);

export function OfflinePill({ pendentes }: OfflinePillProps) {
  const { cor, reduzirMovimento } = useTema();
  const entrada = useSharedValue(0);

  useEffect(() => {
    if (reduzirMovimento) {
      entrada.value = withTiming(1, { duration: 180, easing: CURVA_SAIDA });
      return;
    }
    entrada.value = withSpring(1, { damping: 14, stiffness: 180 });
  }, [reduzirMovimento, entrada]);

  const estilo = useAnimatedStyle(() => ({
    opacity: entrada.value,
    transform: [{ translateY: reduzirMovimento ? 0 : (1 - entrada.value) * -DESLOCAMENTO }],
  }));

  const fila = `${pendentes} ${pendentes === 1 ? 'relato' : 'relatos'} na fila`;

  return (
    <Animated.View
      accessibilityRole="status"
      accessibilityLabel={`Offline · ${fila}`}
      style={[styles.pill, { backgroundColor: cor.textPrimary }, estilo]}
    >
      <Icon name="cloud-cross" tamanho={18} cor={cor.background} />
      <T
        estilo="caption"
        cromo
        corHex={cor.background}
        numberOfLines={1}
        style={styles.texto}
      >
        {`Offline · ${fila}`}
      </T>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'center',
    height: 36,
    maxWidth: 300,
    paddingHorizontal: 14,
    paddingVertical: 0,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
  },
  texto: {
    flexShrink: 1,
    minWidth: 0,
  },
});
