import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { T } from '@/components';
import { useTema } from '@/theme/tema';
import { espaco } from '@/theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const CIRCUNFERENCIA = 63;
const TRACO = 14;

export type SucessoProps = {
  offline: boolean;
};

export function Sucesso({ offline }: SucessoProps) {
  const { cor, reduzirMovimento } = useTema();
  const [circulo] = useState(() => new Animated.Value(reduzirMovimento ? 0 : CIRCUNFERENCIA));
  const [traco] = useState(() => new Animated.Value(reduzirMovimento ? 0 : TRACO));

  useEffect(() => {
    if (reduzirMovimento) {
      circulo.setValue(0);
      traco.setValue(0);
      return;
    }

    circulo.setValue(CIRCUNFERENCIA);
    traco.setValue(TRACO);
    const animaCirculo = Animated.timing(circulo, {
      toValue: 0,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    const animaTraco = Animated.timing(traco, {
      toValue: 0,
      duration: 300,
      delay: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });

    animaCirculo.start();
    animaTraco.start();
    return () => {
      animaCirculo.stop();
      animaTraco.stop();
    };
  }, [circulo, traco, reduzirMovimento]);

  return (
    <View style={[styles.raiz, { backgroundColor: cor.surface }]}>
      <Svg width={64} height={64} viewBox="0 0 24 24" accessibilityLabel="Relato confirmado">
        <AnimatedCircle
          cx={12}
          cy={12}
          r={10}
          fill="none"
          stroke={cor.textPrimary}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeDasharray={CIRCUNFERENCIA}
          strokeDashoffset={circulo as unknown as number}
        />
        <AnimatedPath
          d="M7.5 12.5l3 3 6-6.5"
          fill="none"
          stroke={cor.textPrimary}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={TRACO}
          strokeDashoffset={traco as unknown as number}
        />
      </Svg>
      <T estilo="title" numberOfLines={1}>
        {offline ? 'Na fila' : 'Relato enviado'}
      </T>
      <T estilo="body" cor="textSecondary" numberOfLines={1} style={styles.legenda}>
        {offline ? 'Envia quando voltar a conexão' : 'Já aparece no mapa'}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    ...StyleSheet.absoluteFill,
    zIndex: 5,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: espaco.xl,
  },
  legenda: {
    textAlign: 'center',
  },
});
