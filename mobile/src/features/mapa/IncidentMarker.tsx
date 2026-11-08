import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { ROTULO_SEVERIDADE, ROTULO_TIPO, type Ocorrencia } from '@/domain/tipos';
import { distanciaM, formatarDistancia } from '@/lib/distancia';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { marcador, movimento } from '@/theme/tokens';

import { ICONE_TIPO } from './iconesTipo';
import { useRedesenhoInicial } from './useRedesenhoInicial';
import type { Origem } from './ordenar';

const CURVA_SPRING = Easing.bezier(
  movimento.curvas.spring[0],
  movimento.curvas.spring[1],
  movimento.curvas.spring[2],
  movimento.curvas.spring[3],
);
const CURVA_SAIDA = Easing.bezier(
  movimento.curvas.out[0],
  movimento.curvas.out[1],
  movimento.curvas.out[2],
  movimento.curvas.out[3],
);

export type IncidentMarkerProps = {
  ocorrencia: Ocorrencia;
  selecionado: boolean;
  atenuado: boolean;
  origem: Origem;
  onPress: () => void;
};

export function IncidentMarker({ ocorrencia, selecionado, atenuado, origem, onPress }: IncidentMarkerProps) {
  const { cor, sev, reduzirMovimento } = useTema();
  const severidade = ocorrencia.severidade;
  const critico = severidade === 'critico';
  const tamanho = marcador.tamanho[severidade];
  const anelInterno = sev.anelMarcador ? 1.5 : 0;

  const escala = useSharedValue(selecionado ? marcador.escalaSelecionado : 1);
  const pulso = useSharedValue(0);

  useEffect(() => {
    const alvo = selecionado ? marcador.escalaSelecionado : 1;
    if (reduzirMovimento) {
      escala.value = alvo;
      return;
    }
    escala.value = withTiming(alvo, { duration: 350, easing: CURVA_SPRING });
  }, [selecionado, reduzirMovimento, escala]);

  useEffect(() => {
    if (!critico || reduzirMovimento) {
      pulso.value = 0;
      return;
    }
    pulso.value = withRepeat(withTiming(1, { duration: 1800, easing: CURVA_SAIDA }), -1, false);
  }, [critico, reduzirMovimento, pulso]);

  const estiloEscala = useAnimatedStyle(() => ({ transform: [{ scale: escala.value }] }));
  const estiloPulso = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - pulso.value),
    transform: [{ scale: 1 + pulso.value }],
  }));

  const distancia = formatarDistancia(
    distanciaM(origem.latitude, origem.longitude, ocorrencia.latitude, ocorrencia.longitude),
  );
  const rotulo = `${ROTULO_TIPO[ocorrencia.tipo]}, ${ROTULO_SEVERIDADE[severidade]}, ${distancia}`;

  // No Android o marcador customizado só redesenha com tracksViewChanges; deixe ligado
  // só enquanto ele anima/muda (crítico pulsa, selecionado muda de escala).
  const inicial = useRedesenhoInicial();
  const precisaRedesenho = inicial || selecionado || (critico && !reduzirMovimento);
  // No Android o marcador vira bitmap do tamanho da view: a área precisa caber o pulso (2×)
  // e a escala de seleção (1,22×), senão o desenho é cortado num quadrado
  const comAnel = tamanho + 5;
  const lado = Math.ceil(
    Math.max(44, comAnel * marcador.escalaSelecionado + 2, critico ? tamanho * 2 + 4 : 0),
  );

  return (
    <Marker
      coordinate={{ latitude: ocorrencia.latitude, longitude: ocorrencia.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={precisaRedesenho}
      opacity={atenuado ? 0.38 : 1}
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={rotulo}
    >
      <View style={[styles.area, { width: lado, height: lado }]}>
        {critico && !reduzirMovimento ? (
          <View pointerEvents="none" style={styles.pulsoCaixa}>
            <Animated.View
              style={[
                {
                  width: tamanho,
                  height: tamanho,
                  borderRadius: tamanho / 2,
                  backgroundColor: sev.fill[severidade],
                },
                estiloPulso,
              ]}
            />
          </View>
        ) : null}
        <Animated.View
          style={[
            styles.anel,
            {
              width: tamanho + 5,
              height: tamanho + 5,
              borderRadius: (tamanho + 5) / 2,
              backgroundColor: cor.background,
            },
            estiloEscala,
          ]}
        >
          <View
            style={[
              styles.nucleo,
              {
                width: tamanho,
                height: tamanho,
                borderRadius: tamanho / 2,
                backgroundColor: sev.fill[severidade],
                borderColor: sev.text[severidade],
                borderWidth: anelInterno,
              },
            ]}
          >
            <Icon
              name={ICONE_TIPO[ocorrencia.tipo]}
              peso="bold"
              tamanho={Math.round(tamanho * marcador.proporcaoIcone)}
              cor={sev.onFill}
            />
          </View>
        </Animated.View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  area: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulsoCaixa: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  anel: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nucleo: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
