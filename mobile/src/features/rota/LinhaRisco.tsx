import { StyleSheet, View } from 'react-native';

import { SeverityLabel } from '@/components/SeverityLabel';
import { SeverityMeter } from '@/components/SeverityMeter';
import { T } from '@/components/T';
import { TypeIcon } from '@/components/TypeIcon';
import { ROTULO_TIPO, type OcorrenciaRota } from '@/domain/tipos';
import { useEndereco } from '@/features/mapa/useEndereco';
import { useTema } from '@/theme/tema';
import { espaco, raio, tamanho } from '@/theme/tokens';

export type LinhaRiscoProps = {
  ocorrencia: OcorrenciaRota;
};

/** Linha de um risco contornado (ou no caminho) no resumo da rota. */
export function LinhaRisco({ ocorrencia }: LinhaRiscoProps) {
  const { cor } = useTema();
  const endereco = useEndereco({
    latitude: ocorrencia.latitude,
    longitude: ocorrencia.longitude,
  });

  return (
    <View style={styles.linha}>
      <View style={[styles.tile, { backgroundColor: cor.surfaceMuted }]}>
        <TypeIcon tipo={ocorrencia.tipo} tamanho={tamanho.icon} />
      </View>
      <View style={styles.meio}>
        <T estilo="headline" cromo numberOfLines={1}>
          {ROTULO_TIPO[ocorrencia.tipo]}
        </T>
        <T estilo="caption" cor="textSecondary" numberOfLines={1}>
          {endereco ?? ''}
        </T>
      </View>
      <View style={styles.fim}>
        <SeverityMeter severidade={ocorrencia.severidade} tamanho="s" animar={false} />
        <SeverityLabel severidade={ocorrencia.severidade} estilo="caption" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    minHeight: 56,
  },
  tile: {
    width: 44,
    height: 44,
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
  fim: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    flexShrink: 0,
  },
});
