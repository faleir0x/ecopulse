import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { MiniSegmented } from '@/components/MiniSegmented';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, tamanho } from '@/theme/tokens';

import type { Camada } from './useCamada';

const OPCOES = [
  { valor: 'nenhuma' as const, rotulo: 'Nenhuma' },
  { valor: 'calor' as const, rotulo: 'Calor' },
  { valor: 'ar' as const, rotulo: 'Ar' },
];

export type SeletorCamadaProps = {
  valor: Camada;
  onChange: (camada: Camada) => void;
};

/** Botão circular de camadas + MiniSegmented flutuante à esquerda. Escolher fecha. */
export function SeletorCamada({ valor, onChange }: SeletorCamadaProps) {
  const { cor } = useTema();
  const [aberto, setAberto] = useState(false);

  return (
    <View style={styles.container}>
      {aberto ? (
        <View style={styles.flutuante}>
          <MiniSegmented
            opcoes={OPCOES}
            valor={valor}
            onChange={(camada) => {
              setAberto(false);
              onChange(camada);
            }}
          />
        </View>
      ) : null}

      <Pressable
        onPress={() => setAberto((atual) => !atual)}
        accessibilityRole="button"
        accessibilityLabel="Camadas"
        accessibilityState={{ expanded: aberto }}
        style={[styles.botao, { backgroundColor: cor.surface, borderColor: cor.line }]}
      >
        <Icon name="layers-minimalistic" tamanho={tamanho.icon} cor={cor.textPrimary} />
      </Pressable>
    </View>
  );
}

/** Cabe "Nenhuma · Calor · Ar" com a fonte do cromo a 115%. */
const LARGURA_MENU = 240;

const styles = StyleSheet.create({
  container: {
    width: tamanho.touch,
    height: tamanho.touch,
    alignItems: 'flex-end',
  },
  // Largura explícita: filho absoluto sem largura herda os 44 do pai no Android e é cortado
  flutuante: {
    position: 'absolute',
    top: 0,
    right: tamanho.touch + espaco.sm,
    width: LARGURA_MENU,
    alignItems: 'flex-end',
  },
  botao: {
    width: tamanho.touch,
    height: tamanho.touch,
    borderRadius: tamanho.touch / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
