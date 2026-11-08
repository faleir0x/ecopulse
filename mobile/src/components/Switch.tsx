import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTema } from '@/theme/tema';

export type SwitchProps = {
  valor: boolean;
  onChange: (valor: boolean) => void;
  rotulo: string;
};

const DESLOCAMENTO = 20;

export function Switch({ valor, onChange, rotulo }: SwitchProps) {
  const { esquema, cor, reduzirMovimento } = useTema();
  const posicao = useSharedValue(valor ? DESLOCAMENTO : 0);

  useEffect(() => {
    const destino = valor ? DESLOCAMENTO : 0;
    if (reduzirMovimento) {
      posicao.value = destino;
      return;
    }
    posicao.value = withSpring(destino, { damping: 18, stiffness: 220 });
  }, [valor, reduzirMovimento, posicao]);

  const estilo = useAnimatedStyle(() => ({
    transform: [{ translateX: posicao.value }],
  }));

  return (
    <Pressable
      onPress={() => onChange(!valor)}
      accessibilityRole="switch"
      accessibilityLabel={rotulo}
      accessibilityState={{ checked: valor }}
      hitSlop={{ top: 7, bottom: 7 }}
    >
      <Animated.View
        style={{
          width: 51,
          height: 31,
          borderRadius: 16,
          padding: 2,
          justifyContent: 'center',
          backgroundColor: valor ? cor.ink : cor.surfaceStrong,
        }}
      >
        <Animated.View
          style={[
            {
              width: 27,
              height: 27,
              borderRadius: 14,
              backgroundColor: valor ? cor.onInk : esquema === 'claro' ? cor.surface : cor.ink,
              shadowColor: cor.scrim,
              shadowOpacity: 0.2,
              shadowRadius: 3,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
            },
            estilo,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
