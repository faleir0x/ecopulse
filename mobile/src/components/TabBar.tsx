import type { BottomTabBarProps } from 'expo-router/tabs';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Icon } from '@/icons/Icon';
import type { NomeIcone } from '@/icons';
import { useTema } from '@/theme/tema';
import { espaco, movimento, raio, tamanho } from '@/theme/tokens';

import { Fab } from './Fab';
import { T } from './T';

type Aba = { rotulo: string; icone: NomeIcone };

const ABAS: Record<string, Aba> = {
  index: { rotulo: 'Agora', icone: 'home-angle-2' },
  mapa: { rotulo: 'Mapa', icone: 'map' },
  alertas: { rotulo: 'Alertas', icone: 'bell' },
  ajustes: { rotulo: 'Ajustes', icone: 'settings-minimalistic' },
};

const CURVA_SHEET = Easing.bezier(
  movimento.curvas.sheet[0],
  movimento.curvas.sheet[1],
  movimento.curvas.sheet[2],
  movimento.curvas.sheet[3],
);

function IconeAba({ icone, ativo, cor }: { icone: NomeIcone; ativo: boolean; cor: string }) {
  const opacidade = useSharedValue(ativo ? 1 : 0);

  useEffect(() => {
    opacidade.value = withTiming(ativo ? 1 : 0, { duration: 180 });
  }, [ativo, opacidade]);

  const estiloBold = useAnimatedStyle(() => ({ opacity: opacidade.value }));
  const estiloLinear = useAnimatedStyle(() => ({ opacity: 1 - opacidade.value }));

  return (
    <View style={styles.icone}>
      <Animated.View style={[StyleSheet.absoluteFill, estiloLinear]}>
        <Icon name={icone} peso="linear" tamanho={tamanho.iconLg} cor={cor} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, estiloBold]}>
        <Icon name={icone} peso="bold" tamanho={tamanho.iconLg} cor={cor} />
      </Animated.View>
    </View>
  );
}

/** Espaço que as telas reservam no rodapé para a tab bar flutuante (sem o inset). */
export const ALTURA_TAB_BAR = tamanho.tabBar + espaco.lg + espaco.md + espaco.sm;

const PADDING = 4;
const GAP = 2;
/** Proporção do design: a aba ativa vale 2,3 inativas (tokens motion.tabIndicator). */
const PESO_ATIVA = 2.3;
const ALTURA_ABA = tamanho.tabBar - PADDING * 2 - 4;

/**
 * Larguras calculadas a partir da largura medida da barra, sem depender de flexBasis/flexShrink
 * (que o Yoga no Android resolve diferente da web). Exportada para teste.
 */
export function larguras(larguraBarra: number, quantidade: number) {
  const util = larguraBarra - PADDING * 2 - GAP * (quantidade - 1) - StyleSheet.hairlineWidth * 2;
  const inativa = util / (PESO_ATIVA + quantidade - 1);
  return { ativa: inativa * PESO_ATIVA, inativa };
}

function AbaAnimada({
  largura,
  animar,
  children,
}: {
  largura: number | null;
  animar: boolean;
  children: React.ReactNode;
}) {
  const valor = useSharedValue(largura ?? 0);
  const posicionada = useRef(false);

  useEffect(() => {
    if (largura === null) return;
    // A primeira largura entra direto; só as trocas de aba animam
    valor.value =
      animar && posicionada.current
        ? withTiming(largura, { duration: 460, easing: CURVA_SHEET })
        : largura;
    posicionada.current = true;
  }, [largura, animar, valor]);

  const estilo = useAnimatedStyle(() => ({ width: valor.value }));

  // Antes da primeira medida, divide igualmente para não piscar vazio
  if (largura === null) return <View style={styles.abaPendente}>{children}</View>;
  return <Animated.View style={[styles.abaCaixa, estilo]}>{children}</Animated.View>;
}

export function TabBar({ state, descriptors, navigateToTab, emitter, insets }: BottomTabBarProps) {
  const { cor, sev, reduzirMovimento } = useTema();
  const [larguraBarra, setLarguraBarra] = useState<number | null>(null);
  const jaMediu = useRef(false);
  const indicadorX = useSharedValue(0);
  const indicadorLargura = useSharedValue(0);

  const quantidade = state.routes.length;
  const medidas = larguraBarra === null ? null : larguras(larguraBarra, quantidade);
  const animar = !reduzirMovimento;

  useEffect(() => {
    if (!medidas) return;
    // Todas as abas antes da ativa são inativas
    const x = PADDING + state.index * (medidas.inativa + GAP);
    if (animar && jaMediu.current) {
      indicadorX.value = withTiming(x, { duration: 460, easing: CURVA_SHEET });
      indicadorLargura.value = withTiming(medidas.ativa, { duration: 460, easing: CURVA_SHEET });
    } else {
      indicadorX.value = x;
      indicadorLargura.value = medidas.ativa;
    }
    jaMediu.current = true;
  }, [state.index, medidas?.ativa, medidas?.inativa, animar, indicadorX, indicadorLargura]); // eslint-disable-line react-hooks/exhaustive-deps

  const estiloIndicador = useAnimatedStyle(() => ({
    transform: [{ translateX: indicadorX.value }],
    width: indicadorLargura.value,
  }));

  const medirBarra = (evento: LayoutChangeEvent) => {
    const largura = Math.round(evento.nativeEvent.layout.width);
    setLarguraBarra((atual) => (atual === largura ? atual : largura));
  };

  const abrir = (rota: (typeof state.routes)[number], foco: boolean) => {
    const evento = emitter.emit({
      type: 'tabPress',
      target: rota.key,
      canPreventDefault: true,
    });
    if (!foco && !evento.defaultPrevented) navigateToTab(rota.key);
  };

  return (
    <View
      style={[
        styles.wrap,
        {
          paddingHorizontal: espaco.gutter,
          paddingBottom: Math.max(insets.bottom, espaco.md) + espaco.lg,
        },
      ]}
    >
      <View style={styles.linha}>
        <View
          onLayout={medirBarra}
          style={[
            styles.tabs,
            { backgroundColor: cor.nav, borderColor: cor.line, shadowColor: cor.scrim },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicador,
              { backgroundColor: cor.ink, opacity: medidas ? 1 : 0 },
              estiloIndicador,
            ]}
          />
          {state.routes.map((rota, indice) => {
            const foco = indice === state.index;
            const descriptor = descriptors[rota.key];
            const opcoes = descriptor?.options;
            const aba = ABAS[rota.name] ?? {
              rotulo: typeof opcoes?.title === 'string' ? opcoes.title : rota.name,
              icone: 'home-angle-2' as const,
            };
            const badge = opcoes?.tabBarBadge;
            const temBadge = badge !== undefined && badge !== null && badge !== '' && badge !== 0;

            return (
              <AbaAnimada
                key={rota.key}
                largura={medidas ? (foco ? medidas.ativa : medidas.inativa) : null}
                animar={animar}
              >
                <Pressable
                  onPress={() => abrir(rota, foco)}
                  onLongPress={() => emitter.emit({ type: 'tabLongPress', target: rota.key })}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: foco }}
                  accessibilityLabel={aba.rotulo}
                  style={[styles.aba, foco && styles.abaAtiva]}
                >
                  <IconeAba
                    icone={aba.icone}
                    ativo={foco}
                    cor={foco ? cor.onInk : cor.textSecondary}
                  />
                  {foco ? (
                    <T
                      estilo="headline"
                      cromo
                      numberOfLines={1}
                      style={[styles.rotulo, { color: cor.onInk }]}
                    >
                      {aba.rotulo}
                    </T>
                  ) : null}
                </Pressable>
                {temBadge ? (
                  <View
                    pointerEvents="none"
                    style={[styles.badge, { backgroundColor: sev.fill.critico }]}
                  >
                    <T
                      estilo="caption"
                      cromo
                      corHex={sev.onFill}
                      numberOfLines={1}
                      style={styles.badgeTexto}
                    >
                      {String(badge)}
                    </T>
                  </View>
                ) : null}
              </AbaAnimada>
            );
          })}
        </View>
        <Fab onPress={() => undefined} rotulo="Relatar" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Flutua sobre o conteúdo; as telas reservam ALTURA_TAB_BAR no rodapé
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: espaco.sm,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tabs: {
    flex: 1,
    height: tamanho.tabBar,
    borderRadius: raio.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    padding: PADDING,
    gap: GAP,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  // Posicionado por translateX a partir da borda interna (x já inclui o PADDING)
  indicador: {
    position: 'absolute',
    left: 0,
    top: (tamanho.tabBar - ALTURA_ABA) / 2 - StyleSheet.hairlineWidth,
    height: ALTURA_ABA,
    borderRadius: raio.pill,
  },
  abaCaixa: {
    height: ALTURA_ABA,
  },
  abaPendente: {
    flex: 1,
    height: ALTURA_ABA,
  },
  aba: {
    flex: 1,
    borderRadius: raio.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    overflow: 'hidden',
  },
  abaAtiva: {
    paddingHorizontal: 12,
  },
  icone: {
    width: tamanho.iconLg,
    height: tamanho.iconLg,
  },
  rotulo: {
    fontSize: 14,
    lineHeight: 18,
    flexShrink: 1,
    minWidth: 0,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -9,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTexto: {
    fontSize: 11,
    lineHeight: 14,
  },
});
