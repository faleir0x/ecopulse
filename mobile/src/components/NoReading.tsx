import { StyleSheet, View } from 'react-native';

import { T } from './T';

export type NoReadingProps = {
  linha?: string;
};

export function NoReading({ linha = 'Sem leitura agora' }: NoReadingProps) {
  return (
    <View style={styles.bloco}>
      <T estilo="large" cor="textTertiary" numberOfLines={1}>
        —
      </T>
      <T estilo="caption" cor="textTertiary" numberOfLines={1} style={styles.linha}>
        {linha}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  bloco: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  linha: {
    textAlign: 'center',
  },
});
