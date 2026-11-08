import { Pressable, StyleSheet, View } from 'react-native';

import { useTema } from '@/theme/tema';
import { espaco } from '@/theme/tokens';

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

export function MiniSegmented<V>({ opcoes, valor, onChange }: MiniSegmentedProps<V>) {
  const { cor } = useTema();

  return (
    <View
      accessibilityRole="tablist"
      style={[styles.container, { backgroundColor: cor.surfaceMuted }]}
    >
      {opcoes.map((opcao, indice) => {
        const ativo = Object.is(opcao.valor, valor);
        return (
          <Pressable
            key={indice}
            onPress={() => onChange(opcao.valor)}
            accessibilityRole="tab"
            accessibilityState={{ selected: ativo }}
            accessibilityLabel={opcao.rotulo}
            hitSlop={{ top: 3, bottom: 3 }}
            style={[
              styles.item,
              ativo && { backgroundColor: cor.surface, shadowColor: cor.scrim },
            ]}
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
