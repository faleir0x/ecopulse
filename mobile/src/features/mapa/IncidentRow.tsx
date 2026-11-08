import { Pressable, StyleSheet, View } from 'react-native';

import { SeverityLabel } from '@/components/SeverityLabel';
import { SeverityMeter } from '@/components/SeverityMeter';
import { T } from '@/components/T';
import { TypeIcon } from '@/components/TypeIcon';
import { ROTULO_SEVERIDADE, ROTULO_TIPO, type Ocorrencia } from '@/domain/tipos';
import { formatarDistancia } from '@/lib/distancia';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, raio, tamanho } from '@/theme/tokens';

export type IncidentRowProps = {
  ocorrencia: Ocorrencia;
  distanciaM: number;
  tempo: string;
  onPress: () => void;
};

/** Linha da lista do mapa: tile do tipo, título, "distância · há X" e medidor. */
export function IncidentRow({ ocorrencia, distanciaM, tempo, onPress }: IncidentRowProps) {
  const { cor } = useTema();
  const rotuloAcessivel = `${ROTULO_TIPO[ocorrencia.tipo]}, ${ROTULO_SEVERIDADE[ocorrencia.severidade]}, ${formatarDistancia(distanciaM)}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rotuloAcessivel}
      style={({ pressed }) => [styles.linha, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.tile, { backgroundColor: cor.surfaceMuted }]}>
        <TypeIcon tipo={ocorrencia.tipo} tamanho={tamanho.icon} />
      </View>
      <View style={styles.meio}>
        <T estilo="headline" cromo numberOfLines={1} style={styles.titulo}>
          {ROTULO_TIPO[ocorrencia.tipo]}
        </T>
        <T estilo="caption" cor="textSecondary" numberOfLines={1}>
          {formatarDistancia(distanciaM)} · {tempo}
        </T>
      </View>
      <View style={styles.fim}>
        <SeverityMeter severidade={ocorrencia.severidade} tamanho="s" animar={false} />
        <SeverityLabel severidade={ocorrencia.severidade} estilo="caption" />
        <Icon name="alt-arrow-right" tamanho={tamanho.iconSm} cor={cor.textTertiary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingVertical: espaco.md,
    paddingHorizontal: espaco.gutter,
    minHeight: 64,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: raio.tile,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  meio: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titulo: {
    fontSize: 15,
    lineHeight: 20,
  },
  fim: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    flexShrink: 0,
  },
});
