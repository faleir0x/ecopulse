import { Pressable, StyleSheet, View } from 'react-native';

import { espaco, tamanho } from '@/theme/tokens';

import { T } from './T';

export type SectionHeaderAcao = {
  rotulo: string;
  onPress: () => void;
};

export type SectionHeaderProps = {
  titulo: string;
  acao?: SectionHeaderAcao;
};

export function SectionHeader({ titulo, acao }: SectionHeaderProps) {
  return (
    <View style={styles.linha}>
      <T estilo="headline" cromo numberOfLines={2} style={styles.titulo}>
        {titulo}
      </T>
      {acao ? (
        <Pressable
          onPress={acao.onPress}
          accessibilityRole="button"
          accessibilityLabel={acao.rotulo}
          hitSlop={espaco.sm}
          style={styles.acao}
        >
          <T estilo="caption" cromo cor="textSecondary" numberOfLines={1}>
            {acao.rotulo}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaco.md,
    marginTop: espaco.xl,
    marginBottom: espaco.sm,
    paddingHorizontal: espaco.xs,
  },
  titulo: {
    fontSize: 15,
    lineHeight: 20,
    flexShrink: 1,
    minWidth: 0,
  },
  acao: {
    minHeight: tamanho.touch,
    justifyContent: 'center',
    flexShrink: 0,
  },
});
