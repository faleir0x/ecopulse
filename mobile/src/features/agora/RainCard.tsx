import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
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
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, movimento } from '@/theme/tokens';

export type RainCardProps = {
  chuva3h: number[] | null;
};

const CURVA_SAIDA = Easing.bezier(
  movimento.curvas.out[0],
  movimento.curvas.out[1],
  movimento.curvas.out[2],
  movimento.curvas.out[3],
);

type BarraProps = {
  indice: number;
  altura: number;
  opacidade: number;
  cor: string;
  animar: boolean;
  reduzir: boolean;
};

function Barra({ indice, altura, opacidade, cor, animar, reduzir }: BarraProps) {
  const escala = useSharedValue(animar && !reduzir ? 0 : 1);
  const aparecer = useSharedValue(animar && reduzir ? 0 : 1);

  useEffect(() => {
    if (!animar) return;
    if (reduzir) {
      aparecer.value = withTiming(1, { duration: 180 });
      return;
    }
    escala.value = withDelay(
      500 + indice * 30,
      withTiming(1, { duration: 600, easing: CURVA_SAIDA }),
    );
  }, [animar, indice, reduzir, escala, aparecer]);

  const estilo = useAnimatedStyle(() => ({
    opacity: aparecer.value * opacidade,
    transform: [{ scaleY: reduzir ? 1 : escala.value }],
  }));

  return (
    <View style={styles.slot}>
      <Animated.View
        testID={`chuva-barra-${indice}`}
        style={[styles.barra, { height: `${altura}%`, backgroundColor: cor }, estilo]}
      />
    </View>
  );
}

function formatarPico(pico: number): string {
  if (pico <= 0) return '0';
  if (pico < 1) return pico.toFixed(1).replace('.', ',');
  return String(Math.round(pico));
}

/** Card de chuva: pico das próximas 3 h e 12 barras de 15 min (HANDOFF §5.5). */
export function RainCard({ chuva3h }: RainCardProps) {
  const { cor, reduzirMovimento } = useTema();

  if (chuva3h === null) {
    return (
      <Card estilo={styles.card}>
        <View style={styles.topo}>
          <Icon name="cloud-rain" tamanho={18} cor={cor.textSecondary} />
          <T estilo="caption" cor="textSecondary" numberOfLines={1}>
            Chuva
          </T>
        </View>
        <View style={styles.semLeitura}>
          <NoReading />
        </View>
      </Card>
    );
  }

  const valores = chuva3h.slice(0, 12);
  const pico = valores.reduce((maior, valor) => (valor > maior ? valor : maior), 0);
  const semChuva = pico <= 0;

  return (
    <Card estilo={styles.card}>
      <View style={styles.topo}>
        <Icon name="cloud-rain" tamanho={18} cor={cor.textSecondary} />
        <T estilo="caption" cor="textSecondary" numberOfLines={1}>
          Chuva
        </T>
      </View>

      <View
        style={styles.pico}
        accessible
        accessibilityLabel={semChuva ? 'Sem chuva' : `Pico de ${formatarPico(pico)} milímetros por hora`}
      >
        <T estilo="number" tabular numberOfLines={1}>
          {formatarPico(pico)}
        </T>
        <T estilo="caption" cor="textSecondary" numberOfLines={1}>
          mm/h
        </T>
      </View>

      <View style={styles.barras} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {valores.map((valor, indice) => {
          const altura = semChuva ? 6 : Math.max(6, (valor / pico) * 100);
          const opacidade = semChuva ? 0.25 : valor > 0 ? 0.35 + 0.65 * (valor / pico) : 0.25;
          return (
            <Barra
              key={indice}
              indice={indice}
              altura={altura}
              opacidade={opacidade}
              cor={cor.rain}
              animar
              reduzir={reduzirMovimento}
            />
          );
        })}
      </View>

      <View style={styles.eixo}>
        <T estilo="caption" cor="textTertiary" numberOfLines={1}>
          agora
        </T>
        <T estilo="caption" cor="textTertiary" numberOfLines={1}>
          +3 h
        </T>
      </View>

      {semChuva ? (
        <T estilo="caption" cor="textSecondary" numberOfLines={1} style={styles.aviso}>
          Sem chuva
        </T>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
    padding: espaco.lg,
    gap: 6,
  },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  semLeitura: {
    flex: 1,
    justifyContent: 'center',
  },
  pico: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    marginTop: 6,
  },
  barras: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 46,
    marginTop: 8,
  },
  slot: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
  },
  barra: {
    width: '100%',
    minHeight: 3,
    borderRadius: 2,
    transformOrigin: 'bottom',
  },
  eixo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  aviso: {
    textAlign: 'center',
  },
});
