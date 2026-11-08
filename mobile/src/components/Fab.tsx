import { useState } from 'react';
import { Pressable } from 'react-native';
import Animated, { Easing, useAnimatedStyle, withTiming } from 'react-native-reanimated';

import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { movimento, raio, tamanho } from '@/theme/tokens';

export type FabProps = {
  onPress: () => void;
  rotulo: string;
};

const CURVA_SAIDA = Easing.bezier(
  movimento.curvas.out[0],
  movimento.curvas.out[1],
  movimento.curvas.out[2],
  movimento.curvas.out[3],
);

export function Fab({ onPress, rotulo }: FabProps) {
  const { cor, reduzirMovimento } = useTema();
  const [pressionado, setPressionado] = useState(false);
  const estilo = useAnimatedStyle(
    () => ({
      transform: [
        {
          scale: withTiming(pressionado && !reduzirMovimento ? 0.92 : 1, {
            duration: movimento.pressao.ms,
            easing: CURVA_SAIDA,
          }),
        },
      ],
    }),
    [pressionado, reduzirMovimento],
  );

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressionado(true)}
      onPressOut={() => setPressionado(false)}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
    >
      <Animated.View
        style={[
          {
            width: tamanho.fab,
            height: tamanho.fab,
            borderRadius: raio.pill,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: cor.ink,
            shadowColor: cor.scrim,
            shadowOpacity: 0.45,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 12 },
            elevation: 8,
          },
          estilo,
        ]}
      >
        <Icon name="add" tamanho={28} cor={cor.onInk} />
      </Animated.View>
    </Pressable>
  );
}
