import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { T } from '@/components/T';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, movimento, raio, tamanho } from '@/theme/tokens';

import type { DiaAlertas } from './agrupar';

const CURVA_ENTRADA = Easing.bezier(...movimento.curvas.out);
const CURVA_SAIDA = Easing.bezier(...movimento.curvas.exit);
const LARGURA_MENU = 200;
const SAIDA_MS = 140;

export type SeletorDiaProps = {
  dias: DiaAlertas[];
  valor: string | null;
  onChange: (chave: string) => void;
};

/** Botão "Hoje ⌄": abre um menu com os dias, que cresce a partir do próprio botão. */
export function SeletorDia({ dias, valor, onChange }: SeletorDiaProps) {
  const { cor, reduzirMovimento } = useTema();
  const gatilho = useRef<ComponentRef<typeof Pressable>>(null);
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState({ x: 0, y: 0 });
  const progresso = useSharedValue(0);
  const atual = dias.find((dia) => dia.chave === valor) ?? dias[0];

  // Abre já (o menu nasce invisível) e posiciona quando a medida do botão chega
  const abrir = () => {
    setAberto(true);
    gatilho.current?.measureInWindow((x: number, y: number, _largura: number, altura: number) => {
      setPosicao({ x, y: y + altura + espaco.xs });
    });
  };

  useEffect(() => {
    if (!aberto) return;
    progresso.set(
      reduzirMovimento
        ? withTiming(1, { duration: 120 })
        : withTiming(1, { duration: 220, easing: CURVA_ENTRADA }),
    );
  }, [aberto, progresso, reduzirMovimento]);

  // Sai mais rápido do que entra e pelo mesmo caminho; só então desmonta o Modal
  const timerSaida = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fechar = () => {
    progresso.set(withTiming(0, { duration: SAIDA_MS, easing: CURVA_SAIDA }));
    if (timerSaida.current) clearTimeout(timerSaida.current);
    timerSaida.current = setTimeout(() => setAberto(false), SAIDA_MS);
  };
  useEffect(
    () => () => {
      if (timerSaida.current) clearTimeout(timerSaida.current);
    },
    [],
  );

  const escolher = (chave: string) => {
    onChange(chave);
    fechar();
  };

  const estiloMenu = useAnimatedStyle(() => ({
    opacity: progresso.value,
    transform: reduzirMovimento
      ? []
      : [{ translateY: (1 - progresso.value) * -6 }, { scale: 0.95 + progresso.value * 0.05 }],
  }));
  const estiloSeta = useAnimatedStyle(() => ({
    transform: [{ rotate: `${progresso.value * 180}deg` }],
  }));

  if (!atual) return null;

  return (
    <>
      <Pressable
        ref={gatilho}
        onPress={abrir}
        accessibilityRole="button"
        accessibilityLabel={`Dia: ${atual.rotulo}`}
        accessibilityState={{ expanded: aberto }}
        style={({ pressed }) => [
          styles.gatilho,
          { backgroundColor: cor.surfaceMuted, transform: [{ scale: pressed ? 0.97 : 1 }] },
        ]}
      >
        <T estilo="headline" cromo numberOfLines={1} style={styles.texto}>
          {atual.rotulo}
        </T>
        <Animated.View style={estiloSeta}>
          <Icon name="alt-arrow-down" tamanho={tamanho.iconSm} cor={cor.textSecondary} />
        </Animated.View>
      </Pressable>

      <Modal transparent visible={aberto} onRequestClose={fechar} animationType="none">
        <Pressable style={StyleSheet.absoluteFill} onPress={fechar} accessibilityLabel="Fechar" />
        <Animated.View
          accessibilityRole="menu"
          style={[
            styles.menu,
            {
              top: posicao.y,
              left: posicao.x,
              backgroundColor: cor.surface,
              borderColor: cor.line,
              shadowColor: cor.scrim,
            },
            estiloMenu,
          ]}
        >
          {dias.map((dia, indice) => {
            const ativo = dia.chave === atual.chave;
            const novos = dia.itens.filter((item) => !item.lido).length;
            return (
              <Pressable
                key={dia.chave}
                onPress={() => escolher(dia.chave)}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: ativo }}
                accessibilityLabel={`${dia.rotulo}${novos > 0 ? `, ${novos} novos` : ''}`}
                style={({ pressed }) => [
                  styles.opcao,
                  indice > 0 && {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: cor.line,
                  },
                  pressed && { backgroundColor: cor.surfaceMuted },
                ]}
              >
                <T estilo="body" cromo numberOfLines={1} style={styles.opcaoTexto}>
                  {dia.rotulo}
                </T>
                {novos > 0 ? (
                  <View style={[styles.ponto, { backgroundColor: cor.accent }]} />
                ) : null}
                {ativo ? (
                  <Icon name="check-circle" tamanho={tamanho.iconSm} cor={cor.textPrimary} />
                ) : (
                  <View style={styles.espacoIcone} />
                )}
              </Pressable>
            );
          })}
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  gatilho: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: raio.pill,
    alignSelf: 'flex-start',
  },
  texto: {
    fontSize: 15,
    lineHeight: 20,
  },
  menu: {
    position: 'absolute',
    width: LARGURA_MENU,
    borderRadius: raio.chip,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    transformOrigin: 'top left',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  opcao: {
    minHeight: tamanho.touch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    paddingHorizontal: 14,
  },
  opcaoTexto: {
    flex: 1,
    minWidth: 0,
  },
  ponto: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  espacoIcone: {
    width: tamanho.iconSm,
  },
});
