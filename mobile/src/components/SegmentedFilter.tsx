import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/icons/Icon';
import type { NomeIcone } from '@/icons';
import { useTema } from '@/theme/tema';
import { espaco, movimento, raio, tamanho } from '@/theme/tokens';

import { T } from './T';

export type SegmentedFilterOpcao<V> = {
  valor: V;
  rotulo: string;
  icone?: NomeIcone;
};

export type SegmentedFilterProps<V> = {
  opcoes: SegmentedFilterOpcao<V>[];
  valor: V;
  onChange: (valor: V) => void;
};

const CURVA_SHEET = Easing.bezier(
  movimento.curvas.sheet[0],
  movimento.curvas.sheet[1],
  movimento.curvas.sheet[2],
  movimento.curvas.sheet[3],
);

export function SegmentedFilter<V>({ opcoes, valor, onChange }: SegmentedFilterProps<V>) {
  const { cor, reduzirMovimento } = useTema();
  const [medidas, setMedidas] = useState<Record<number, { x: number; width: number }>>({});
  const indicadorX = useSharedValue(0);
  const indicadorLargura = useSharedValue(0);
  const indiceAtivo = opcoes.findIndex((opcao) => Object.is(opcao.valor, valor));

  useEffect(() => {
    const medida = medidas[indiceAtivo];
    if (!medida) return;

    if (reduzirMovimento) {
      indicadorX.value = medida.x;
      indicadorLargura.value = medida.width;
      return;
    }

    indicadorX.value = withTiming(medida.x, { duration: 420, easing: CURVA_SHEET });
    indicadorLargura.value = withTiming(medida.width, { duration: 420, easing: CURVA_SHEET });
  }, [indiceAtivo, medidas, reduzirMovimento, indicadorX, indicadorLargura]);

  const estiloIndicador = useAnimatedStyle(() => ({
    left: indicadorX.value,
    width: indicadorLargura.value,
  }));

  const medir = (indice: number, evento: LayoutChangeEvent) => {
    const { x, width } = evento.nativeEvent.layout;
    setMedidas((atual) => {
      const existente = atual[indice];
      if (existente && existente.x === x && existente.width === width) return atual;
      return { ...atual, [indice]: { x, width } };
    });
  };

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.container,
        { backgroundColor: cor.nav, borderColor: cor.line, shadowColor: cor.scrim },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.indicador, { backgroundColor: cor.ink }, estiloIndicador]}
      />
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
            style={styles.item}
          >
            {opcao.icone ? (
              <Icon
                name={opcao.icone}
                tamanho={20}
                cor={ativo ? cor.onInk : cor.textSecondary}
              />
            ) : null}
            {ativo ? (
              <T
                estilo="headline"
                cromo
                numberOfLines={1}
                style={[styles.rotulo, { color: cor.onInk }]}
              >
                {opcao.rotulo}
              </T>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: espaco.xs,
    borderRadius: raio.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: '100%',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  indicador: {
    position: 'absolute',
    top: espaco.xs,
    height: tamanho.touch,
    borderRadius: raio.pill,
  },
  item: {
    height: tamanho.touch,
    minWidth: tamanho.touch,
    paddingHorizontal: espaco.md,
    borderRadius: raio.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 1,
  },
  rotulo: {
    fontSize: 14,
    lineHeight: 18,
    flexShrink: 1,
    minWidth: 0,
  },
});
