import { Pressable, StyleSheet, View } from 'react-native';

import { SeverityMeter } from '@/components/SeverityMeter';
import { T } from '@/components/T';
import { TypeIcon } from '@/components/TypeIcon';
import { ROTULO_SEVERIDADE, ROTULO_TIPO } from '@/domain/tipos';
import { formatarDistancia } from '@/lib/distancia';
import { useTema } from '@/theme/tema';
import { espaco, raio, tamanho } from '@/theme/tokens';

import { horaMinuto } from '@/features/mapa/tempo';

import type { ItemAlerta } from './regras';

export type AlertRowProps = {
  item: ItemAlerta;
  tempo: string;
  onPress: () => void;
};

export function AlertRow({ item, tempo, onPress }: AlertRowProps) {
  const { cor } = useTema();
  const ocorrencia = item.ocorrencia;
  const rotuloAcessivel = `${ROTULO_TIPO[ocorrencia.tipo]}, ${ROTULO_SEVERIDADE[ocorrencia.severidade]}, ${formatarDistancia(item.distanciaM)}, ${tempo}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={rotuloAcessivel}
      style={({ pressed }) => [styles.linha, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.tile, { backgroundColor: cor.surfaceMuted }]}>
        <TypeIcon tipo={ocorrencia.tipo} tamanho={tamanho.icon} />
        {!item.lido ? (
          <View
            style={[styles.naoLido, { backgroundColor: cor.accent, borderColor: cor.surface }]}
          />
        ) : null}
      </View>

      <View style={styles.meio}>
        <T estilo="headline" cromo numberOfLines={1} style={styles.titulo}>
          {ROTULO_TIPO[ocorrencia.tipo]}
        </T>
        <T estilo="caption" cor="textSecondary" numberOfLines={1}>
          {formatarDistancia(item.distanciaM)} · {tempo}
        </T>
      </View>

      <View style={styles.fim}>
        <T estilo="caption" cor="textTertiary" tabular numberOfLines={1}>
          {horaMinuto(item.recebidoEm)}
        </T>
        <SeverityMeter severidade={ocorrencia.severidade} tamanho="s" animar={false} />
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
  naoLido: {
    position: 'absolute',
    top: -3,
    left: -3,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
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
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
});
