import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { T } from '@/components/T';
import type { ModoRota } from '@/domain/tipos';
import type { NomeIcone } from '@/icons';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, movimento, raio, tamanho } from '@/theme/tokens';

const MODOS: { valor: ModoRota; rotulo: string; icone: NomeIcone }[] = [
  { valor: 'pedestre', rotulo: 'A pé', icone: 'walking' },
  { valor: 'carro', rotulo: 'Carro', icone: 'car' },
];

const CURVA_SHEET = Easing.bezier(...movimento.curvas.sheet);

export type SeletorModoProps = {
  valor: ModoRota;
  onChange: (modo: ModoRota) => void;
};

/** Segmentado de largura total (A pé · Carro); o indicador desliza só com transform. */
export function SeletorModo({ valor, onChange }: SeletorModoProps) {
  const { cor, reduzirMovimento } = useTema();
  const [largura, setLargura] = useState(0);
  const indice = MODOS.findIndex((modo) => modo.valor === valor);
  const deslocamento = useSharedValue(0);
  const metade = largura > 0 ? (largura - espaco.xs * 2) / 2 : 0;

  useEffect(() => {
    const destino = indice * metade;
    deslocamento.value = reduzirMovimento
      ? destino
      : withTiming(destino, { duration: 420, easing: CURVA_SHEET });
  }, [indice, metade, reduzirMovimento, deslocamento]);

  const estiloIndicador = useAnimatedStyle(() => ({
    transform: [{ translateX: deslocamento.value }],
  }));

  return (
    <View
      accessibilityRole="tablist"
      onLayout={(evento) => setLargura(evento.nativeEvent.layout.width)}
      style={[styles.container, { backgroundColor: cor.surfaceMuted }]}
    >
      {metade > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.indicador, { width: metade, backgroundColor: cor.ink }, estiloIndicador]}
        />
      ) : null}
      {MODOS.map((modo) => {
        const ativo = modo.valor === valor;
        const corItem = ativo ? cor.onInk : cor.textSecondary;
        return (
          <Pressable
            key={modo.valor}
            onPress={() => onChange(modo.valor)}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativo }}
            accessibilityLabel={modo.rotulo}
            style={styles.item}
          >
            <Icon name={modo.icone} tamanho={18} cor={corItem} />
            <T estilo="headline" cromo numberOfLines={1} style={{ color: corItem }}>
              {modo.rotulo}
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
    padding: espaco.xs,
    borderRadius: raio.pill,
  },
  indicador: {
    position: 'absolute',
    top: espaco.xs,
    left: espaco.xs,
    height: tamanho.touch,
    borderRadius: raio.pill,
  },
  item: {
    flex: 1,
    height: tamanho.touch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});
