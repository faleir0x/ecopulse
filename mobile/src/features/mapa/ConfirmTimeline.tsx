import { StyleSheet, View } from 'react-native';

import { T } from '@/components/T';
import type { Severidade } from '@/domain/tipos';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';

import { horaMinuto } from './tempo';

/** Número máximo de pontos visíveis na linha do tempo (os mais recentes). */
export const MAX_PONTOS_VISIVEIS = 12;

export type ConfirmTimelineProps = {
  itens: string[];
  severidade: Severidade;
  /** Ocorrência encerrada: o fim da linha vira um check com a hora do encerramento. */
  encerradaEm?: string | null;
};

/** Total de confirmações e linha do tempo de pontos (o último na cor da severidade). */
export function ConfirmTimeline({ itens, severidade, encerradaEm = null }: ConfirmTimelineProps) {
  const { cor, sev } = useTema();
  const visiveis = itens.length > MAX_PONTOS_VISIVEIS ? itens.slice(-MAX_PONTOS_VISIVEIS) : itens;
  const total = itens.length;
  const primeiraHora = itens.length > 0 ? horaMinuto(itens[0]!) : null;
  const ultimoIndice = visiveis.length - 1;

  return (
    <View style={[styles.cartao, { backgroundColor: cor.surfaceMuted }]}>
      <View style={styles.cabecalho}>
        <T estilo="caption" cor="textSecondary">
          Confirmações
        </T>
        <T estilo="headline" cromo tabular numberOfLines={1}>
          {total.toLocaleString('pt-BR')}
        </T>
      </View>
      <View style={styles.track}>
        <View style={[styles.base, { backgroundColor: cor.surfaceStrong }]} />
        <View style={styles.pontos}>
          {visiveis.map((_item, indice) => {
            const ultimo = indice === ultimoIndice && encerradaEm === null;
            if (!ultimo) {
              return (
                <View
                  key={indice}
                  testID="ponto-timeline"
                  style={[styles.ponto, { backgroundColor: cor.textTertiary }]}
                />
              );
            }
            return (
              <View
                key={indice}
                testID="ponto-timeline"
                style={[styles.pontoUltimo, { backgroundColor: cor.surfaceMuted }]}
              >
                <View style={[styles.pontoUltimoNucleo, { backgroundColor: sev.fill[severidade] }]} />
              </View>
            );
          })}
          {encerradaEm !== null ? (
            <View style={[styles.fim, { backgroundColor: cor.surfaceMuted }]}>
              <Icon name="check-circle" tamanho={16} cor={cor.textSecondary} />
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.eixo}>
        <T estilo="caption" cor="textTertiary" numberOfLines={1}>
          {primeiraHora ?? '—'}
        </T>
        <T estilo="caption" cor="textTertiary" tabular numberOfLines={1}>
          {encerradaEm !== null ? horaMinuto(encerradaEm) : 'agora'}
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fim: {
    paddingLeft: 2,
  },
  cartao: {
    marginHorizontal: 16,
    marginTop: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },
  track: {
    position: 'relative',
    height: 28,
    justifyContent: 'center',
    marginTop: 12,
    marginBottom: 6,
  },
  base: {
    position: 'absolute',
    left: 4,
    right: 4,
    height: 2,
    borderRadius: 1,
    top: '50%',
    marginTop: -1,
  },
  pontos: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  ponto: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  pontoUltimo: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pontoUltimoNucleo: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  eixo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
});
