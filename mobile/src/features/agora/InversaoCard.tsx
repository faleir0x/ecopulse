import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { T } from '@/components/T';
import type { LeituraAmbiente } from '@/domain/tipos';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco } from '@/theme/tokens';

export type InversaoCardProps = {
  leitura: LeituraAmbiente | null;
};

function formatarDelta(delta: number): string {
  return delta.toFixed(1).replace('.', ',');
}

/** Aviso de inversão térmica: o ar quente acima da cidade prende a poluição perto do chão. */
export function InversaoCard({ leitura }: InversaoCardProps) {
  const { sev } = useTema();

  if (leitura?.inversao_termica !== true) {
    return null;
  }

  const delta = leitura.inversao_delta_c;

  return (
    <Card estilo={styles.card}>
      <View style={styles.topo}>
        <Icon name="danger-triangle" tamanho={18} cor={sev.text.alto} />
        <T estilo="caption" cor="textSecondary" numberOfLines={1}>
          Inversão térmica
        </T>
      </View>

      <T estilo="body" cor="textSecondary">
        O ar mais quente acima da cidade prende a poluição perto do chão. Evite exercícios ao ar
        livre e, se puder, mantenha janelas fechadas nas horas de pico.
      </T>

      {delta != null ? (
        <T estilo="caption" cor="textTertiary">
          Ar {formatarDelta(delta)} °C mais quente a algumas centenas de metros
        </T>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: espaco.lg,
    gap: 6,
    marginTop: espaco.md,
  },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
});
