import { StyleSheet, View } from 'react-native';

import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, tamanho } from '@/theme/tokens';

import { Pill } from './Pill';
import { T } from './T';

export type InlineErrorProps = {
  onTentar: () => void;
};

export function InlineError({ onTentar }: InlineErrorProps) {
  const { cor } = useTema();

  return (
    <View style={styles.linha}>
      <Icon name="cloud-cross" tamanho={tamanho.iconLg} cor={cor.textTertiary} />
      <T estilo="body" numberOfLines={1} cor="textSecondary" style={styles.texto}>
        Não carregou
      </T>
      <Pill rotulo="Tentar" icone="refresh" onPress={onTentar} />
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
  texto: {
    flex: 1,
    minWidth: 0,
  },
});
