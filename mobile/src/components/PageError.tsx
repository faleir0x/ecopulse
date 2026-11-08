import { StyleSheet, View } from 'react-native';

import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, tamanho } from '@/theme/tokens';

import { Button } from './Button';
import { Pill } from './Pill';
import { T } from './T';

export type PageErrorProps = {
  onTentar: () => void;
  compacta?: boolean;
};

export function PageError({ onTentar, compacta = false }: PageErrorProps) {
  const { cor } = useTema();

  if (compacta) {
    return (
      <View style={styles.compacta}>
        <Icon name="cloud-cross" tamanho={tamanho.iconLg} cor={cor.textTertiary} />
        <T estilo="headline" cromo numberOfLines={1} style={styles.textoCompacto}>
          Não foi possível carregar
        </T>
        <Pill rotulo="Tentar" icone="refresh" onPress={onTentar} />
      </View>
    );
  }

  return (
    <View style={styles.bloco}>
      <Icon name="cloud-cross" tamanho={40} cor={cor.textTertiary} />
      <T estilo="headline" cromo numberOfLines={2} style={styles.titulo}>
        Não foi possível carregar
      </T>
      <Button rotulo="Tentar de novo" variante="secundario" icone="refresh" onPress={onTentar} />
    </View>
  );
}

const styles = StyleSheet.create({
  bloco: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingVertical: 56,
    paddingHorizontal: espaco.xl,
  },
  titulo: {
    textAlign: 'center',
    maxWidth: 260,
  },
  compacta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingVertical: espaco.md,
  },
  textoCompacto: {
    flex: 1,
    minWidth: 0,
  },
});
