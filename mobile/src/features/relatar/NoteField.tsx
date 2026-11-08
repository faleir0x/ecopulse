import { useEffect } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { T } from '@/components';
import { useTema } from '@/theme/tema';
import { espaco, movimento, raio, texto } from '@/theme/tokens';

export const MAX_NOTA = 140;

const CURVA_SAIDA = Easing.bezier(
  movimento.curvas.out[0],
  movimento.curvas.out[1],
  movimento.curvas.out[2],
  movimento.curvas.out[3],
);

export type NoteFieldProps = {
  valor: string;
  onMudar: (valor: string) => void;
};

export function NoteField({ valor, onMudar }: NoteFieldProps) {
  const { cor, reduzirMovimento } = useTema();
  const entrada = useSharedValue(reduzirMovimento ? 1 : 0);

  useEffect(() => {
    entrada.value = reduzirMovimento
      ? withTiming(1, { duration: 180, easing: CURVA_SAIDA })
      : withTiming(1, { duration: 300, easing: CURVA_SAIDA });
  }, [entrada, reduzirMovimento]);

  const estilo = useAnimatedStyle(() => ({
    opacity: entrada.value,
    transform: [{ translateY: (1 - entrada.value) * 8 }],
  }));

  return (
    <Animated.View style={[styles.caixa, estilo]}>
      <TextInput
        value={valor}
        onChangeText={onMudar}
        maxLength={MAX_NOTA}
        multiline
        autoFocus
        placeholder="O que está acontecendo?"
        placeholderTextColor={cor.textTertiary}
        accessibilityLabel="Detalhe do relato"
        style={[
          styles.campo,
          {
            backgroundColor: cor.surfaceMuted,
            borderColor: cor.line,
            color: cor.textPrimary,
          },
        ]}
      />
      <T
        estilo="caption"
        cor="textTertiary"
        tabular
        numberOfLines={1}
        style={styles.contador}
      >
        {`${valor.length}/${MAX_NOTA}`}
      </T>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  caixa: {
    position: 'relative',
  },
  campo: {
    minHeight: 76,
    borderWidth: 1,
    borderRadius: raio.chip,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 22,
    fontFamily: 'RedHatText_400Regular',
    fontSize: texto.body.tamanho,
    lineHeight: texto.body.alturaLinha,
    textAlignVertical: 'top',
  },
  contador: {
    position: 'absolute',
    right: espaco.md,
    bottom: espaco.sm,
    fontSize: 12,
  },
});
