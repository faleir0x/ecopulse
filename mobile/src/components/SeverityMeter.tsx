import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { nivel, type Severidade } from '@/domain/tipos';
import { useTema } from '@/theme/tema';
import { medidor as tokenMedidor, movimento } from '@/theme/tokens';

export type SeverityMeterProps = {
  severidade: Severidade | null;
  tamanho?: 's' | 'm' | 'l';
  animar?: boolean;
  /** Ocorrência encerrada: as barras acesas ficam neutras. */
  apagado?: boolean;
};

const ALTURAS = tokenMedidor.alturas;
const ROTULO_ACESSIVEL: Record<Severidade, string> = {
  baixo: 'Baixa',
  moderado: 'Moderada',
  alto: 'Alta',
  critico: 'Crítica',
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
  largura: number;
  cor: string;
  animar: boolean;
  reduzir: boolean;
};

function Barra({ indice, altura, largura, cor, animar, reduzir }: BarraProps) {
  const escala = useSharedValue(animar && !reduzir ? 0 : 1);
  const opacidade = useSharedValue(animar && reduzir ? 0 : 1);

  useEffect(() => {
    if (!animar) return;
    if (reduzir) {
      opacidade.value = withTiming(1, { duration: 180 });
      return;
    }
    escala.value = withDelay(
      indice * 50,
      withTiming(1, { duration: 400, easing: CURVA_SAIDA }),
    );
  }, [animar, indice, reduzir, escala, opacidade]);

  const estilo = useAnimatedStyle(() => ({
    opacity: opacidade.value,
    transform: [{ scaleY: escala.value }],
  }));

  return (
    <Animated.View
      testID={`barra-severidade-${indice}`}
      style={[
        {
          width: largura,
          height: altura,
          borderRadius: largura / 2,
          backgroundColor: cor,
          transformOrigin: 'bottom',
        },
        estilo,
      ]}
    />
  );
}

export function SeverityMeter({
  severidade,
  tamanho = 's',
  animar = true,
  apagado = false,
}: SeverityMeterProps) {
  const { cor, sev, reduzirMovimento } = useTema();
  const dimensao = tokenMedidor.tamanhos[tamanho];
  const acesas = severidade ? nivel(severidade) : 0;
  const rotulo = severidade ? `Severidade ${ROTULO_ACESSIVEL[severidade]}` : 'Sem severidade';

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={rotulo}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        gap: dimensao.gap,
        height: dimensao.h,
        flexShrink: 0,
      }}
    >
      {ALTURAS.map((altura, indice) => (
        <Barra
          key={indice}
          indice={indice}
          altura={dimensao.h * altura}
          largura={dimensao.w}
          cor={
            indice < acesas && severidade
              ? apagado
                ? cor.textTertiary
                : sev.meter[severidade]
              : cor.surfaceStrong
          }
          animar={animar}
          reduzir={reduzirMovimento}
        />
      ))}
    </View>
  );
}
