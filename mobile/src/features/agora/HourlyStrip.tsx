import { useEffect } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Card } from '@/components/Card';
import { NoReading } from '@/components/NoReading';
import { T } from '@/components/T';
import type { HoraPrevista } from '@/domain/tipos';
import { condicao } from '@/features/agora/tempo';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { escalaTemperatura, movimento } from '@/theme/tokens';

import { corNaEscala, posicaoNaFaixa } from './escalas';

export type HourlyStripProps = {
  horas: HoraPrevista[] | null;
  /** Temperatura atual: substitui a da primeira coluna ("Agora"). */
  agora?: number | null;
};

const CURVA_SAIDA = Easing.bezier(
  movimento.curvas.out[0],
  movimento.curvas.out[1],
  movimento.curvas.out[2],
  movimento.curvas.out[3],
);

function horaLocal(iso: string, indice: number): string {
  if (indice === 0) return 'Agora';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return `${data.getHours()}h`;
}

function ehNoite(iso: string): boolean {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return false;
  const hora = data.getHours();
  return hora < 6 || hora >= 18;
}

type CapsulaProps = {
  indice: number;
  temperatura: number | null;
  reduzir: boolean;
};

function Capsula({ indice, temperatura, reduzir }: CapsulaProps) {
  const { cor } = useTema();
  const escala = useSharedValue(reduzir ? 1 : 0);

  useEffect(() => {
    if (reduzir) {
      escala.value = withTiming(1, { duration: 180 });
      return;
    }
    escala.value = withDelay(
      500 + indice * 30,
      withTiming(1, { duration: 600, easing: CURVA_SAIDA }),
    );
  }, [indice, reduzir, escala]);

  const estilo = useAnimatedStyle(() => ({
    transform: [{ scaleY: reduzir ? 1 : escala.value }],
  }));

  if (temperatura === null) {
    return <View style={[styles.capsula, styles.capsulaVazia, { borderColor: cor.textTertiary }]} />;
  }

  const altura = Math.max(6, posicaoNaFaixa(temperatura, escalaTemperatura.capsula) * 100);

  return (
    <View style={[styles.capsula, { backgroundColor: cor.surfaceStrong }]}>
      <Animated.View
        testID={`hora-capsula-${indice}`}
        style={[
          styles.capsulaPreenchida,
          { height: `${altura}%`, backgroundColor: corNaEscala(temperatura), transformOrigin: 'bottom' },
          estilo,
        ]}
      />
    </View>
  );
}

/** Faixa horizontal das próximas horas (HANDOFF §5.6). */
export function HourlyStrip({ horas, agora = null }: HourlyStripProps) {
  const { cor, reduzirMovimento } = useTema();

  if (!horas || horas.length === 0) {
    return (
      <Card estilo={styles.card}>
        <NoReading />
      </Card>
    );
  }

  return (
    <Card estilo={styles.card}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.conteudo}
      >
        {horas.map((hora, indice) => {
          // "Agora" usa a temperatura atual (a mesma do topo), não a previsão da hora cheia
          const prevista =
            typeof hora.temperatura === 'number' && Number.isFinite(hora.temperatura)
              ? hora.temperatura
              : null;
          const temperatura = indice === 0 && agora !== null ? agora : prevista;
          const codigo = typeof hora.codigo_tempo === 'number' ? hora.codigo_tempo : null;
          const previsao = condicao(codigo, ehNoite(hora.hora));
          const rotulo = horaLocal(hora.hora, indice);

          return (
            <View
              key={`${hora.hora}-${indice}`}
              style={styles.item}
              accessible
              accessibilityLabel={`${rotulo}, ${
                temperatura === null ? 'sem previsão' : `${Math.round(temperatura)} graus`
              }, ${previsao.texto}`}
            >
              <T
                estilo="caption"
                cor={indice === 0 ? 'textPrimary' : 'textSecondary'}
                numberOfLines={1}
                style={indice === 0 ? styles.agora : undefined}
              >
                {rotulo}
              </T>
              {temperatura === null ? (
                <Icon name="cloud-cross" tamanho={26} cor={cor.textTertiary} />
              ) : (
                <Icon
                  name={previsao.icone}
                  peso="bold-duotone"
                  tamanho={26}
                  cor={cor.textPrimary}
                />
              )}
              <Capsula indice={indice} temperatura={temperatura} reduzir={reduzirMovimento} />
              <T
                estilo="body"
                cor={temperatura === null ? 'textTertiary' : 'textPrimary'}
                tabular
                numberOfLines={1}
                style={styles.valor}
              >
                {temperatura === null ? '—' : `${Math.round(temperatura)}°`}
              </T>
            </View>
          );
        })}
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  conteudo: {
    gap: 6,
    paddingHorizontal: 4,
  },
  item: {
    width: 46,
    alignItems: 'center',
    gap: 8,
  },
  agora: {
    fontWeight: '600',
  },
  capsula: {
    width: 6,
    height: 52,
    borderRadius: 3,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  capsulaVazia: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  capsulaPreenchida: {
    width: '100%',
    borderRadius: 3,
  },
  valor: {
    fontWeight: '600',
  },
});
