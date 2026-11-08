import { LinearGradient } from 'expo-linear-gradient';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { NoReading } from '@/components/NoReading';
import { T } from '@/components/T';
import type { LeituraAmbiente } from '@/domain/tipos';
import { useTema } from '@/theme/tema';
import { espaco, escalaTemperatura, movimento } from '@/theme/tokens';

import { gradienteTemperatura, posicaoNaFaixa } from './escalas';

export type TempRangeProps = {
  leitura: LeituraAmbiente | null;
};

const CURVA_SAIDA = Easing.bezier(
  movimento.curvas.out[0],
  movimento.curvas.out[1],
  movimento.curvas.out[2],
  movimento.curvas.out[3],
);

/** Faixa mín./máx. com gradiente de temperatura e ponto "agora" (HANDOFF §5.3). */
export function TempRange({ leitura }: TempRangeProps) {
  const { cor, reduzirMovimento } = useTema();
  const preenchimento = useSharedValue(reduzirMovimento ? 1 : 0);
  const ponto = useSharedValue(reduzirMovimento ? 1 : 0);

  useEffect(() => {
    if (reduzirMovimento) {
      preenchimento.value = withTiming(1, { duration: 180 });
      ponto.value = withTiming(1, { duration: 180 });
      return;
    }
    preenchimento.value = withDelay(
      350,
      withTiming(1, { duration: 800, easing: CURVA_SAIDA }),
    );
    ponto.value = withDelay(900, withSpring(1, { damping: 14, stiffness: 180 }));
  }, [reduzirMovimento, preenchimento, ponto]);

  const estiloPreenchimento = useAnimatedStyle(() => ({
    opacity: preenchimento.value,
    transform: [{ scaleX: reduzirMovimento ? 1 : preenchimento.value }],
  }));
  const estiloPonto = useAnimatedStyle(() => ({
    transform: [{ scale: reduzirMovimento ? 1 : ponto.value }],
  }));

  const minima = leitura?.minima_dia ?? null;
  const maxima = leitura?.maxima_dia ?? null;
  const atual = leitura?.temperatura ?? null;

  if (minima === null || maxima === null || atual === null) {
    return (
      <View style={styles.semLeitura}>
        <NoReading />
      </View>
    );
  }

  const inicio = Math.min(minima, maxima);
  const fim = Math.max(minima, maxima);
  const posicaoInicio = posicaoNaFaixa(inicio, escalaTemperatura.faixa);
  const posicaoFim = posicaoNaFaixa(fim, escalaTemperatura.faixa);
  const posicaoAgora = posicaoNaFaixa(atual, escalaTemperatura.faixa);
  const largura = Math.max(posicaoFim - posicaoInicio, 0.02);
  const gradiente = gradienteTemperatura(inicio, fim);

  return (
    <View
      style={styles.linha}
      accessible
      accessibilityLabel={`Mínima ${Math.round(minima)} graus, máxima ${Math.round(
        maxima,
      )} graus, agora ${Math.round(atual)} graus`}
    >
      <T estilo="caption" cor="textSecondary" tabular numberOfLines={1} style={styles.ponta}>
        {Math.round(minima)}°
      </T>

      <View style={[styles.trilho, { backgroundColor: cor.surfaceStrong }]}>
        <Animated.View
          style={[
            styles.preenchimento,
            {
              left: `${posicaoInicio * 100}%`,
              width: `${largura * 100}%`,
              transformOrigin: 'left',
            },
            estiloPreenchimento,
          ]}
        >
          <LinearGradient
            colors={gradiente.cores as [string, string, ...string[]]}
            locations={gradiente.posicoes as [number, number, ...number[]]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <Animated.View
          testID="temperatura-agora"
          style={[
            styles.ponto,
            {
              left: `${posicaoAgora * 100}%`,
              backgroundColor: cor.textPrimary,
              borderColor: cor.background,
            },
            estiloPonto,
          ]}
        />
      </View>

      <T
        estilo="caption"
        cor="textSecondary"
        tabular
        numberOfLines={1}
        style={[styles.ponta, styles.pontaDireita]}
      >
        {Math.round(maxima)}°
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    marginTop: 22,
  },
  semLeitura: {
    marginTop: 22,
    minHeight: 14,
    justifyContent: 'center',
  },
  ponta: {
    width: 32,
    flexShrink: 0,
  },
  pontaDireita: {
    textAlign: 'right',
  },
  trilho: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    position: 'relative',
  },
  preenchimento: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 3,
    overflow: 'hidden',
  },
  ponto: {
    position: 'absolute',
    top: '50%',
    width: 14,
    height: 14,
    marginTop: -7,
    marginLeft: -7,
    borderRadius: 7,
    borderWidth: 3,
  },
});
