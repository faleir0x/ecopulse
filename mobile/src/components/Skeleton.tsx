import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useTema } from '@/theme/tema';
import { movimento } from '@/theme/tokens';

export type SkeletonProps = {
  largura: number | `${number}%`;
  altura: number;
  raio?: number;
};

export function Skeleton({ largura, altura, raio = 10 }: SkeletonProps) {
  const { cor, reduzirMovimento } = useTema();
  const opacidade = useSharedValue(reduzirMovimento ? 1 : movimento.skeleton.opacidadeMin);

  useEffect(() => {
    if (reduzirMovimento) {
      opacidade.value = 1;
      return;
    }
    opacidade.value = withRepeat(
      withTiming(1, {
        duration: movimento.skeleton.ms,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [reduzirMovimento, opacidade]);

  const estilo = useAnimatedStyle(() => ({ opacity: opacidade.value }));

  return (
    <Animated.View
      testID="skeleton"
      style={[
        { width: largura, height: altura, borderRadius: raio, backgroundColor: cor.surfaceMuted },
        estilo,
      ]}
    />
  );
}
