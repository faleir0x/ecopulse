import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { Card } from '@/components/Card';
import { SeverityMeter } from '@/components/SeverityMeter';
import { T } from '@/components/T';
import { ROTULO_SEVERIDADE } from '@/domain/tipos';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, faixasAqi, movimento } from '@/theme/tokens';

import { nivelAqi } from './escalas';

export type AqiGaugeProps = {
  aqi: number | null;
};

const CURVA_SAIDA = Easing.bezier(
  movimento.curvas.out[0],
  movimento.curvas.out[1],
  movimento.curvas.out[2],
  movimento.curvas.out[3],
);

/** Quantidade de segmentos acesos para um AQI (0..21). */
export function segmentosAcesos(aqi: number | null): number {
  if (aqi === null || !Number.isFinite(aqi)) return 0;
  const valor = Math.min(Math.max(aqi, 0), faixasAqi.gaugeMax);
  return Math.round((valor / faixasAqi.gaugeMax) * faixasAqi.segmentos);
}

const RAIO_INTERNO = 52;
const RAIO_EXTERNO = 66;
const CENTRO_X = 74;
const CENTRO_Y = 72;

/** Gauge semicircular de 21 segmentos do AQI (HANDOFF §5.5). */
export function AqiGauge({ aqi }: AqiGaugeProps) {
  const { cor, sev, reduzirMovimento } = useTema();
  const entrada = useSharedValue(reduzirMovimento ? 1 : 0);

  useEffect(() => {
    if (reduzirMovimento) {
      entrada.value = withTiming(1, { duration: 180 });
      return;
    }
    entrada.value = withDelay(450, withTiming(1, { duration: 320, easing: CURVA_SAIDA }));
  }, [reduzirMovimento, entrada]);

  const estiloGauge = useAnimatedStyle(() => ({
    opacity: entrada.value,
    transform: [{ scale: reduzirMovimento ? 1 : 0.4 + 0.6 * entrada.value }],
  }));

  const nivel = nivelAqi(aqi);
  const acesos = segmentosAcesos(aqi);
  const corAcesa = nivel ? sev.meter[nivel] : cor.textTertiary;

  const segmentos = Array.from({ length: faixasAqi.segmentos }, (_, indice) => {
    const angulo = Math.PI + (indice / (faixasAqi.segmentos - 1)) * Math.PI;
    const cosseno = Math.cos(angulo);
    const seno = Math.sin(angulo);
    return {
      indice,
      x1: CENTRO_X + cosseno * RAIO_INTERNO,
      y1: CENTRO_Y + seno * RAIO_INTERNO,
      x2: CENTRO_X + cosseno * RAIO_EXTERNO,
      y2: CENTRO_Y + seno * RAIO_EXTERNO,
    };
  });

  return (
    <Card estilo={styles.card}>
      <View style={styles.topo}>
        <Icon name="wind" tamanho={18} cor={cor.textSecondary} />
        <T estilo="caption" cor="textSecondary" numberOfLines={1}>
          Ar
        </T>
      </View>

      <Animated.View style={[styles.gauge, estiloGauge]}>
        <Svg width="100%" height={80} viewBox="0 0 148 80">
          {segmentos.map(({ indice, x1, y1, x2, y2 }) => {
            const aceso = indice < acesos;
            return (
              <Line
                key={indice}
                testID={aceso ? 'aqi-segmento-aceso' : 'aqi-segmento-apagado'}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={aceso ? corAcesa : cor.surfaceStrong}
                strokeWidth={5}
                strokeLinecap="round"
              />
            );
          })}
        </Svg>
        <View style={styles.numero} pointerEvents="none">
          <T estilo="number" tabular numberOfLines={1}>
            {aqi === null ? '—' : String(aqi)}
          </T>
        </View>
      </Animated.View>

      {nivel === null ? (
        <T estilo="caption" cor="textTertiary" numberOfLines={1} style={styles.semLeitura}>
          Sem leitura agora
        </T>
      ) : (
        <View style={styles.rodape}>
          <SeverityMeter severidade={nivel} tamanho="s" animar={false} />
          <T estilo="caption" corHex={sev.text[nivel]} numberOfLines={1} style={styles.nivel}>
            {ROTULO_SEVERIDADE[nivel]}
          </T>
          <T estilo="caption" cor="textTertiary" numberOfLines={1}>
            AQI
          </T>
        </View>
      )}
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
  gauge: {
    marginTop: 2,
    alignSelf: 'stretch',
    height: 80,
    justifyContent: 'center',
  },
  numero: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  rodape: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    flexWrap: 'wrap',
  },
  nivel: {
    fontWeight: '600',
    flexShrink: 1,
    minWidth: 0,
  },
  semLeitura: {
    textAlign: 'center',
  },
});
