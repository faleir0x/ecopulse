import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTema } from '@/theme/tema';
import { movimento } from '@/theme/tokens';

export type ScrollEdgeProps = {
  visivel: boolean;
};

const CURVA_SAIDA = Easing.bezier(
  movimento.curvas.out[0],
  movimento.curvas.out[1],
  movimento.curvas.out[2],
  movimento.curvas.out[3],
);

export function ScrollEdge({ visivel }: ScrollEdgeProps) {
  const { cor, reduzirMovimento } = useTema();
  const opacidade = useSharedValue(visivel ? 1 : 0);

  useEffect(() => {
    opacidade.value = withTiming(visivel ? 1 : 0, {
      duration: reduzirMovimento ? 180 : 250,
      easing: CURVA_SAIDA,
    });
  }, [visivel, reduzirMovimento, opacidade]);

  const estilo = useAnimatedStyle(() => ({ opacity: opacidade.value }));

  return (
    <Animated.View pointerEvents="none" style={[styles.edge, estilo]}>
      <LinearGradient
        colors={[cor.background, cor.background, 'transparent']}
        locations={[0, 0.52, 1]}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  edge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 96,
    zIndex: 40,
  },
});
