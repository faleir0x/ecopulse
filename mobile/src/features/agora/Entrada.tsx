import { useEffect, type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useTema } from '@/theme/tema';
import { movimento } from '@/theme/tokens';

const CURVA_SAIDA = Easing.bezier(
  movimento.curvas.out[0],
  movimento.curvas.out[1],
  movimento.curvas.out[2],
  movimento.curvas.out[3],
);

export type EntradaProps = {
  indice: number;
  children: ReactNode;
  estilo?: StyleProp<ViewStyle>;
};

/** Entrada dos blocos: opacity + y 10, escalonada em 55 ms por bloco. */
export function Entrada({ indice, children, estilo }: EntradaProps) {
  const { reduzirMovimento } = useTema();
  const progresso = useSharedValue(reduzirMovimento ? 1 : 0);

  useEffect(() => {
    if (reduzirMovimento) {
      progresso.value = withTiming(1, { duration: 180 });
      return;
    }
    progresso.value = withDelay(
      indice * movimento.entrada.escalonamento,
      withTiming(1, { duration: movimento.entrada.ms, easing: CURVA_SAIDA }),
    );
  }, [indice, reduzirMovimento, progresso]);

  const animado = useAnimatedStyle(() => ({
    opacity: progresso.value,
    transform: [{ translateY: reduzirMovimento ? 0 : (1 - progresso.value) * movimento.entrada.deslocamentoY }],
  }));

  return <Animated.View style={[estilo, animado]}>{children}</Animated.View>;
}
