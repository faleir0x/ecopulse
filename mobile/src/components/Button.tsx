import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import Animated, { Easing, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';

import { Icon } from '@/icons/Icon';
import type { NomeIcone } from '@/icons';
import { useTema } from '@/theme/tema';
import { movimento, raio, tamanho } from '@/theme/tokens';

import { T } from './T';

export type ButtonProps = {
  rotulo: string;
  onPress: () => void;
  variante?: 'primario' | 'secundario';
  desabilitado?: boolean;
  carregando?: boolean;
  icone?: NomeIcone;
  estilo?: StyleProp<ViewStyle>;
};

const CURVA_SAIDA = Easing.bezier(
  movimento.curvas.out[0],
  movimento.curvas.out[1],
  movimento.curvas.out[2],
  movimento.curvas.out[3],
);

export function Button({
  rotulo,
  onPress,
  variante = 'primario',
  desabilitado = false,
  carregando = false,
  icone,
  estilo,
}: ButtonProps) {
  const { cor, reduzirMovimento } = useTema();
  const [pressionado, setPressionado] = useState(false);
  const inativo = desabilitado || carregando;

  const estiloEscala = useAnimatedStyle(
    () => ({
      transform: [
        {
          scale: withTiming(pressionado && !reduzirMovimento ? movimento.pressao.escala : 1, {
            duration: movimento.pressao.ms,
            easing: CURVA_SAIDA,
          }),
        },
      ],
    }),
    [pressionado, reduzirMovimento],
  );

  const fundo = inativo
    ? cor.surfaceMuted
    : variante === 'primario'
      ? cor.ink
      : cor.surfaceMuted;
  const frente = inativo
    ? cor.textTertiary
    : variante === 'primario'
      ? cor.onInk
      : cor.textPrimary;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressionado(true)}
      onPressOut={() => setPressionado(false)}
      disabled={inativo}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={{ disabled: inativo, busy: carregando }}
    >
      <Animated.View
        style={[
          styles.base,
          { backgroundColor: fundo, borderRadius: raio.button },
          estiloEscala,
          estilo,
        ]}
      >
        {carregando ? (
          <ActivityIndicator
            testID="botao-carregando"
            accessibilityLabel="Carregando"
            color={frente}
          />
        ) : (
          <>
            {icone ? (
              <Icon name={icone} tamanho={tamanho.iconSm} cor={frente} />
            ) : null}
            <T estilo="headline" cromo numberOfLines={1} corHex={frente} style={styles.rotulo}>
              {rotulo}
            </T>
          </>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: tamanho.button,
    minWidth: tamanho.touch,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  rotulo: {
    fontSize: 16,
    lineHeight: 20,
    flexShrink: 1,
    minWidth: 0,
  },
});
