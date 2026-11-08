import { StyleSheet, View } from 'react-native';

import { Icon } from '@/icons/Icon';
import type { NomeIcone } from '@/icons';
import { useTema } from '@/theme/tema';
import { espaco, tamanho } from '@/theme/tokens';

import { Pill } from './Pill';
import { T } from './T';

export type EmptyRowAcao = {
  rotulo: string;
  onPress: () => void;
};

export type EmptyRowProps = {
  titulo: string;
  acao?: EmptyRowAcao;
  icone?: NomeIcone;
};

export function EmptyRow({ titulo, acao, icone = 'check-circle' }: EmptyRowProps) {
  const { cor } = useTema();

  return (
    <View style={styles.linha}>
      <Icon name={icone} tamanho={tamanho.iconLg} cor={cor.textSecondary} />
      <T estilo="body" numberOfLines={2} cor="textSecondary" style={styles.titulo}>
        {titulo}
      </T>
      {acao ? <Pill rotulo={acao.rotulo} icone="add" onPress={acao.onPress} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    padding: espaco.gutter,
  },
  titulo: {
    flex: 1,
    minWidth: 0,
  },
});
