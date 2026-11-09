import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTema } from '@/theme/tema';
import { espaco, movimento } from '@/theme/tokens';

import { T } from './T';

export type MiniSegmentedOpcao<V> = {
  valor: V;
  rotulo: string;
};

export type MiniSegmentedProps<V> = {
  opcoes: MiniSegmentedOpcao<V>[];
  valor: V;
  onChange: (valor: V) => void;
};

const CURVA_SHEET = Easing.bezier(...movimento.curvas.sheet);
const DURACAO_MS = 420;

/** Segmentado compacto: a pílula da opção ativa desliza até a nova escolha. */
export function MiniSegmented<V>({ opcoes, valor, onChange }: MiniSegmentedProps<V>) {
  const { cor, reduzirMovimento } = useTema();
  const [medidas, setMedidas] = useState<Record<number, { x: number; width: number }>>({});
  const indiceAtivo = opcoes.findIndex((opcao) => Object.is(opcao.valor, valor));
  const x = useSharedValue(0);
  const largura = useSharedValue(0);
  const visivel = useSharedValue(0);
  const posicionado = useRef(false);

  const medida = medidas[indiceAtivo];
  useEffect(() => {
    if (!medida) return;
    // Primeira medida: aparece no lugar, sem deslizar a partir do zero
    if (!posicionado.current || reduzirMovimento) {
      posicionado.current = true;
      x.value = medida.x;
      largura.value = medida.width;
      visivel.value = 1;
      return;
    }
    x.value = withTiming(medida.x, { duration: DURACAO_MS, easing: CURVA_SHEET });
    largura.value = withTiming(medida.width, { duration: DURACAO_MS, easing: CURVA_SHEET });
  }, [medida, reduzirMovimento, x, largura, visivel]);

  const estiloIndicador = useAnimatedStyle(() => ({
    opacity: visivel.value,
    width: largura.value,
    transform: [{ translateX: x.value }],
  }));

  const medir = (indice: number, evento: LayoutChangeEvent) => {
    const { x: posicao, width } = evento.nativeEvent.layout;
    setMedidas((atual) => {
      const existente = atual[indice];
      if (existente && existente.x === posicao && existente.width === width) return atual;
      return { ...atual, [indice]: { x: posicao, width } };
    });
  };

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.container, { backgroundColor: cor.surfaceMuted }]}
    >
      {medida ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicador,
            { backgroundColor: cor.surface, shadowColor: cor.scrim },
            estiloIndicador,
          ]}
        />
      ) : null}
      {opcoes.map((opcao, indice) => {
        const ativo = indice === indiceAtivo;
        return (
          <Pressable
            key={indice}
            onPress={() => onChange(opcao.valor)}
            onLayout={(evento) => medir(indice, evento)}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativo }}
            accessibilityLabel={opcao.rotulo}
            hitSlop={{ top: 3, bottom: 3 }}
            style={styles.item}
          >
            <T
              estilo="headline"
              cromo
              numberOfLines={1}
              cor={ativo ? 'textPrimary' : 'textSecondary'}
              style={styles.rotulo}
            >
              {opcao.rotulo}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 3,
    borderRadius: 14,
    flexShrink: 0,
  },
  indicador: {
    position: 'absolute',
    top: 3,
    left: 0,
    height: 38,
    borderRadius: 11,
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  item: {
    height: 38,
    paddingHorizontal: espaco.md,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rotulo: {
    fontSize: 13,
    lineHeight: 18,
  },
});
