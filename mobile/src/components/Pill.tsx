import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/icons/Icon';
import type { NomeIcone } from '@/icons';
import { useTema } from '@/theme/tema';
import { espaco, raio, tamanho } from '@/theme/tokens';


import { T } from './T';

export type PillProps = {
  rotulo: string;
  icone?: NomeIcone;
  onPress?: () => void;
  /** Indicador girando no lugar do ícone (ex.: "Localizando…"). */
  carregando?: boolean;
};

export function Pill({ rotulo, icone, onPress, carregando = false }: PillProps) {
  const { cor } = useTema();

  const conteudo = (
    <>
      {carregando ? (
        <ActivityIndicator size="small" color={cor.textSecondary} />
      ) : icone ? (
        <Icon name={icone} tamanho={tamanho.iconSm} cor={cor.textPrimary} />
      ) : null}
      <T estilo="headline" cromo numberOfLines={1} style={styles.rotulo}>
        {rotulo}
      </T>
    </>
  );

  if (!onPress) {
    return (
      <View style={[styles.base, { backgroundColor: cor.surfaceMuted }]}>{conteudo}</View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: cor.surfaceMuted, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      {conteudo}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: tamanho.touch,
    minWidth: tamanho.touch,
    paddingHorizontal: espaco.gutter,
    borderRadius: raio.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexShrink: 0,
  },
  rotulo: {
    fontSize: 14,
    lineHeight: 18,
    flexShrink: 1,
    minWidth: 0,
  },
});
