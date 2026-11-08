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

export function TabBar({ state, descriptors, navigateToTab, emitter, insets }: BottomTabBarProps) {
  const { cor, sev, reduzirMovimento } = useTema();
  const [medidas, setMedidas] = useState<Record<string, { x: number; width: number }>>({});
  const indicadorX = useSharedValue(0);
  const indicadorLargura = useSharedValue(0);
  const posicionado = useRef(false);

  const rotaAtiva = state.routes[state.index];
  const nomeAtivo = rotaAtiva?.name;

  useEffect(() => {
    if (!nomeAtivo) return;
    const medida = medidas[nomeAtivo];
    if (!medida) return;

    // Primeira medida: posiciona sem animar (não desliza a partir da borda ao abrir o app)
    if (reduzirMovimento || !posicionado.current) {
      posicionado.current = true;
      indicadorX.value = medida.x;
      indicadorLargura.value = medida.width;
      return;
    }

    indicadorX.value = withTiming(medida.x, { duration: 460, easing: CURVA_SHEET });
    indicadorLargura.value = withTiming(medida.width, { duration: 460, easing: CURVA_SHEET });
  }, [nomeAtivo, medidas, reduzirMovimento, indicadorX, indicadorLargura]);

  const estiloIndicador = useAnimatedStyle(() => ({
    left: indicadorX.value,
    width: indicadorLargura.value,
  }));

  const medir = (chave: string, evento: LayoutChangeEvent) => {
    const { x, width } = evento.nativeEvent.layout;
    setMedidas((atual) => {
      const existente = atual[chave];
      if (existente && existente.x === x && existente.width === width) return atual;
      return { ...atual, [chave]: { x, width } };
    });
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
          style={[
            styles.tabs,
            { backgroundColor: cor.nav, borderColor: cor.line, shadowColor: cor.scrim },
          ]}
        >
          <Animated.View
            pointerEvents="none"
            style={[styles.indicador, { backgroundColor: cor.ink }, estiloIndicador]}
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
              <Pressable
                key={rota.key}
                onPress={() => abrir(rota, foco)}
                onLongPress={() =>
                  emitter.emit({ type: 'tabLongPress', target: rota.key })
                }
                onLayout={(evento) => medir(rota.name, evento)}
                accessibilityRole="tab"
                accessibilityState={{ selected: foco }}
                accessibilityLabel={aba.rotulo}
                // Ativa: parte da largura do próprio conteúdo (o rótulo sempre cabe) e cresce mais
                style={[styles.aba, foco ? styles.abaAtiva : styles.abaInativa]}
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
                {temBadge ? (
                  <View style={[styles.badge, { backgroundColor: sev.fill.critico }]}>
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
              </Pressable>
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
    gap: 10,
  },
  tabs: {
    flex: 1,
    height: tamanho.tabBar,
    borderRadius: raio.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    gap: 2,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  indicador: {
    position: 'absolute',
    top: 6,
    height: 52,
    borderRadius: raio.pill,
  },
  aba: {
    height: 52,
    minWidth: 52,
    borderRadius: raio.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: espaco.md,
    zIndex: 1,
  },
  abaAtiva: {
    flexGrow: 2.3,
    flexBasis: 'auto',
    flexShrink: 0,
  },
  abaInativa: {
    flexGrow: 1,
    flexBasis: 0,
    flexShrink: 1,
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
