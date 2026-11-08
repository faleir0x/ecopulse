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
import { useUi } from '@/state/ui';
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

const ICONE = tamanho.iconLg;
const ESPACO_ROTULO = 6;
const PADDING_ATIVA = 12;
const TOPO_ABA = (tamanho.tabBar - ALTURA_ABA) / 2 - StyleSheet.hairlineWidth;

/** x (a partir da borda interna da barra) da aba `i` quando a ativa é `ativa`. Exportada para teste. */
export function posicaoAba(i: number, ativa: number, m: { ativa: number; inativa: number }): number {
  return PADDING + i * (m.inativa + GAP) + (i > ativa ? m.ativa - m.inativa : 0);
}

/**
 * Parte visual de uma aba. Anima SÓ transform e opacity (motion.rules): a caixa tem sempre a
 * largura da ativa e desliza com translateX; o ícone desliza dentro dela e o rótulo aparece por
 * opacidade. Nada de animar width (recalcula layout a cada quadro e travava a troca de aba).
 */
function AbaVisual({
  x,
  foco,
  medidas,
  rotulo,
  icone,
  badge,
  animar,
}: {
  x: number;
  foco: boolean;
  medidas: { ativa: number; inativa: number };
  rotulo: string;
  icone: NomeIcone;
  badge: string | null;
  animar: boolean;
}) {
  const { cor, sev } = useTema();
  const [larguraRotulo, setLarguraRotulo] = useState(0);
  const maxRotulo = medidas.ativa - PADDING_ATIVA * 2 - ICONE - ESPACO_ROTULO;
  const rotuloVisivel = Math.min(larguraRotulo, maxRotulo);
  const iconeInativo = (medidas.inativa - ICONE) / 2;
  const iconeAtivo = (medidas.ativa - (ICONE + ESPACO_ROTULO + rotuloVisivel)) / 2;

  const posX = useSharedValue(x);
  const iconeX = useSharedValue(foco ? iconeAtivo : iconeInativo);
  const opacidadeRotulo = useSharedValue(foco ? 1 : 0);
  const posicionada = useRef(false);

  useEffect(() => {
    const destinoIcone = foco ? iconeAtivo : iconeInativo;
    if (!animar || !posicionada.current) {
      posX.value = x;
      iconeX.value = destinoIcone;
      opacidadeRotulo.value = foco ? 1 : 0;
      posicionada.current = true;
      return;
    }
    const config = { duration: 460, easing: CURVA_SHEET };
    posX.value = withTiming(x, config);
    iconeX.value = withTiming(destinoIcone, config);
    // O rótulo some rápido e aparece depois que a aba já abriu espaço
    opacidadeRotulo.value = foco
      ? withTiming(1, { duration: 260, easing: CURVA_SHEET })
      : withTiming(0, { duration: 120 });
  }, [x, foco, iconeAtivo, iconeInativo, animar, posX, iconeX, opacidadeRotulo]);

  const estiloCaixa = useAnimatedStyle(() => ({ transform: [{ translateX: posX.value }] }));
  const estiloIcone = useAnimatedStyle(() => ({ transform: [{ translateX: iconeX.value }] }));
  const estiloRotulo = useAnimatedStyle(() => ({
    opacity: opacidadeRotulo.value,
    transform: [{ translateX: iconeX.value + ICONE + ESPACO_ROTULO }],
  }));

  return (
    <Animated.View pointerEvents="none" style={[styles.abaVisual, { width: medidas.ativa }, estiloCaixa]}>
      <Animated.View style={[styles.iconeCaixa, estiloIcone]}>
        <IconeAba icone={icone} ativo={foco} cor={foco ? cor.onInk : cor.textSecondary} />
        {badge ? (
          <View style={[styles.badge, { backgroundColor: sev.fill.critico }]}>
            <T estilo="caption" cromo corHex={sev.onFill} numberOfLines={1} style={styles.badgeTexto}>
              {badge}
            </T>
          </View>
        ) : null}
      </Animated.View>
      <Animated.View style={[styles.rotuloCaixa, { maxWidth: maxRotulo }, estiloRotulo]}>
        <T
          estilo="headline"
          cromo
          numberOfLines={1}
          onLayout={(e) => setLarguraRotulo(Math.ceil(e.nativeEvent.layout.width))}
          style={[styles.rotulo, { color: cor.onInk }]}
        >
          {rotulo}
        </T>
      </Animated.View>
    </Animated.View>
  );
}

export function TabBar({ state, descriptors, navigateToTab, emitter, insets }: BottomTabBarProps) {
  const { cor, reduzirMovimento } = useTema();
  const { modoFoco, setRelatarAberto } = useUi();
  const descida = useSharedValue(0);
  const [larguraBarra, setLarguraBarra] = useState<number | null>(null);
  const jaMediu = useRef(false);
  const indicadorX = useSharedValue(0);

  const quantidade = state.routes.length;
  const medidas = larguraBarra === null ? null : larguras(larguraBarra, quantidade);
  const animar = !reduzirMovimento;

  // O indicador tem sempre a largura da ativa: só desliza (translateX), sem animar width
  useEffect(() => {
    if (!medidas) return;
    const x = posicaoAba(state.index, state.index, medidas);
    indicadorX.value =
      animar && jaMediu.current ? withTiming(x, { duration: 460, easing: CURVA_SHEET }) : x;
    jaMediu.current = true;
  }, [state.index, medidas?.ativa, medidas?.inativa, animar, indicadorX]); // eslint-disable-line react-hooks/exhaustive-deps

  // Modo foco: a barra desce 130 px (motion.focusMode) e libera o rodapé para a sheet
  useEffect(() => {
    const destino = modoFoco ? 130 : 0;
    descida.value = reduzirMovimento ? destino : withTiming(destino, { duration: 500, easing: CURVA_SHEET });
  }, [modoFoco, reduzirMovimento, descida]);
  const estiloDescida = useAnimatedStyle(() => ({ transform: [{ translateY: descida.value }] }));

  const estiloIndicador = useAnimatedStyle(() => ({
    transform: [{ translateX: indicadorX.value }],
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

  const abas = state.routes.map((rota, indice) => {
    const opcoes = descriptors[rota.key]?.options;
    const aba = ABAS[rota.name] ?? {
      rotulo: typeof opcoes?.title === 'string' ? opcoes.title : rota.name,
      icone: 'home-angle-2' as const,
    };
    const badge = opcoes?.tabBarBadge;
    const temBadge = badge !== undefined && badge !== null && badge !== '' && badge !== 0;
    return { rota, indice, foco: indice === state.index, aba, badge: temBadge ? String(badge) : null };
  });

  return (
    <Animated.View
      pointerEvents={modoFoco ? 'none' : 'box-none'}
      style={[
        estiloDescida,
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
          {medidas ? (
            <>
              <Animated.View
                pointerEvents="none"
                style={[styles.indicador, { width: medidas.ativa, backgroundColor: cor.ink }, estiloIndicador]}
              />
              {abas.map(({ rota, foco, aba, badge }) => (
                <AbaVisual
                  key={`visual-${rota.key}`}
                  x={posicaoAba(abas.findIndex((a) => a.rota.key === rota.key), state.index, medidas)}
                  foco={foco}
                  medidas={medidas}
                  rotulo={aba.rotulo}
                  icone={aba.icone}
                  badge={badge}
                  animar={animar}
                />
              ))}
            </>
          ) : null}
          {/* Camada de toque: larguras mudam na hora (invisível), o visual acima é que anima */}
          {abas.map(({ rota, foco, aba }) => (
            <Pressable
              key={rota.key}
              onPress={() => abrir(rota, foco)}
              onLongPress={() => emitter.emit({ type: 'tabLongPress', target: rota.key })}
              accessibilityRole="tab"
              accessibilityState={{ selected: foco }}
              accessibilityLabel={aba.rotulo}
              style={[
                styles.toque,
                medidas ? { width: foco ? medidas.ativa : medidas.inativa } : styles.toquePendente,
              ]}
            />
          ))}
        </View>
        <Fab onPress={() => setRelatarAberto(true)} rotulo="Relatar" />
      </View>
    </Animated.View>
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
    top: TOPO_ABA,
    height: ALTURA_ABA,
    borderRadius: raio.pill,
  },
  abaVisual: {
    position: 'absolute',
    left: 0,
    top: TOPO_ABA,
    height: ALTURA_ABA,
  },
  iconeCaixa: {
    position: 'absolute',
    left: 0,
    top: (ALTURA_ABA - ICONE) / 2,
    width: ICONE,
    height: ICONE,
  },
  rotuloCaixa: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  toque: {
    height: ALTURA_ABA,
    borderRadius: raio.pill,
  },
  toquePendente: {
    flex: 1,
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
