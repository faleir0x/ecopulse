import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTema } from '@/theme/tema';
import { raio } from '@/theme/tokens';

export type CardProps = {
  children: ReactNode;
  estilo?: StyleProp<ViewStyle>;
};

export function Card({ children, estilo }: CardProps) {
  const { esquema, cor } = useTema();

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: cor.surface, shadowColor: cor.scrim },
        esquema === 'claro' && styles.sombra,
        estilo,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: raio.card,
  },
  sombra: {
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
