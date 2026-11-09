import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { ROTULO_SEVERIDADE, SEVERIDADES, type Severidade } from '@/domain/tipos';
import { useTema } from '@/theme/tema';
import { movimento, raio } from '@/theme/tokens';

import { SeverityMeter } from './SeverityMeter';
import { T } from './T';

export type ThresholdRulerProps = {
  valor: Severidade;
  onChange: (valor: Severidade) => void;
};

const CURVA_SHEET = Easing.bezier(...movimento.curvas.sheet);
const VAO = 6;

/** Quatro níveis; o contorno colorido desliza até o nível escolhido. */
export function ThresholdRuler({ valor, onChange }: ThresholdRulerProps) {
  const { esquema, cor, sev, reduzirMovimento } = useTema();
  const indiceLimiar = SEVERIDADES.indexOf(valor);
  const [largura, setLargura] = useState(0);
  const larguraTile =
    largura > 0 ? (largura - VAO * (SEVERIDADES.length - 1)) / SEVERIDADES.length : 0;
  const destino = indiceLimiar * (larguraTile + VAO);
  const x = useSharedValue(destino);
  const visivel = useSharedValue(0);
  const posicionado = useRef(false);

  useEffect(() => {
    if (larguraTile <= 0) return;
    // Primeira medida: aparece no lugar, sem deslizar a partir do zero
    if (!posicionado.current || reduzirMovimento) {
      posicionado.current = true;
      x.value = destino;
      visivel.value = 1;
      return;
    }
    x.value = withTiming(destino, { duration: 420, easing: CURVA_SHEET });
  }, [destino, larguraTile, reduzirMovimento, x, visivel]);

  const estiloAnel = useAnimatedStyle(() => ({
    opacity: visivel.value,
    transform: [{ translateX: x.value }],
  }));
  const corAnel = esquema === 'claro' ? sev.text[valor] : sev.fill[valor];

  return (
    <View
      accessibilityRole="tablist"
      style={styles.linha}
      onLayout={(evento) => setLargura(evento.nativeEvent.layout.width)}
    >
      {SEVERIDADES.map((nivel, indice) => {
        const ativo = nivel === valor;
        const aceso = indice >= indiceLimiar;

        return (
          <Pressable
            key={nivel}
            onPress={() => onChange(nivel)}
            testID={`limiar-${nivel}`}
            accessibilityRole="button"
            accessibilityLabel={`Avisar a partir de: ${ROTULO_SEVERIDADE[nivel]}`}
            accessibilityState={{ selected: ativo }}
            style={({ pressed }) => [
              styles.tile,
              { backgroundColor: cor.surfaceMuted, transform: [{ scale: pressed ? 0.97 : 1 }] },
            ]}
          >
            <SeverityMeter severidade={aceso ? nivel : null} tamanho="m" animar={false} />
            <T
              estilo="caption"
              cromo
              numberOfLines={1}
              cor={aceso ? 'textPrimary' : 'textTertiary'}
              style={styles.rotulo}
            >
              {ROTULO_SEVERIDADE[nivel]}
            </T>
          </Pressable>
        );
      })}
      {larguraTile > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.anel, { width: larguraTile, borderColor: corAnel }, estiloAnel]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: VAO,
  },
  anel: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: 64,
    borderRadius: raio.chip,
    borderWidth: 2,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    height: 64,
    borderRadius: raio.chip,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  rotulo: {
    fontSize: 12.5,
    lineHeight: 18,
  },
});
