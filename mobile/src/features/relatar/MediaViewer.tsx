import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MidiaLocal } from '@/data/outbox';
import { Icon } from '@/icons/Icon';
import { T } from '@/components';

const FUNDO = '#000000';
const CURVA_SHEET = Easing.bezier(0.32, 0.72, 0, 1);

export type MediaViewerProps = {
  midias: MidiaLocal[];
  indiceInicial: number;
  onFechar: () => void;
};

function VideoSlide({ uri, ativo }: { uri: string; ativo: boolean }) {
  const player = useVideoPlayer(uri, (instancia) => {
    instancia.loop = false;
  });

  useEffect(() => {
    if (!ativo) {
      player.pause();
    }
  }, [ativo, player]);

  return (
    <VideoView
      player={player}
      style={styles.midia}
      nativeControls
      contentFit="contain"
    />
  );
}

export function MediaViewer({ midias, indiceInicial, onFechar }: MediaViewerProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [indice, setIndice] = useState(() =>
    Math.max(0, Math.min(midias.length - 1, indiceInicial)),
  );

  const [abertura] = useState(() => new Animated.Value(0));
  const [translator] = useState(() => new Animated.Value(-indice * width));
  const [arrastoY] = useState(() => new Animated.Value(0));
  const eixo = useRef<'x' | 'y' | null>(null);

  useEffect(() => {
    abertura.setValue(0);
    Animated.timing(abertura, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [abertura]);

  useEffect(() => {
    translator.setValue(-indice * width);
    // Só reajusta quando a largura muda; trocas de item são animadas no gesto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  const irPara = (proximo: number) => {
    const alvo = Math.max(0, Math.min(midias.length - 1, proximo));
    setIndice(alvo);
    Animated.timing(translator, {
      toValue: -alvo * width,
      duration: 420,
      easing: CURVA_SHEET,
      useNativeDriver: true,
    }).start();
  };

  const fecharArrastando = () => {
    Animated.timing(arrastoY, {
      toValue: 420,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onFechar();
      }
    });
  };

  const responder = useMemo(() => {
    const voltarAoCentro = () => {
      Animated.spring(translator, {
        toValue: -indice * width,
        damping: 18,
        stiffness: 220,
        useNativeDriver: true,
      }).start();
      Animated.timing(arrastoY, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    };

    // eslint-disable-next-line react-hooks/refs -- eixo é mutável só dentro dos handlers do gesto
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesto) =>
        Math.abs(gesto.dx) > 8 || Math.abs(gesto.dy) > 8,
      onPanResponderGrant: () => {
        eixo.current = null;
      },
      onPanResponderMove: (_, gesto) => {
        if (eixo.current === null) {
          if (Math.hypot(gesto.dx, gesto.dy) > 8) {
            eixo.current = Math.abs(gesto.dx) > Math.abs(gesto.dy) ? 'x' : 'y';
          } else {
            return;
          }
        }

        if (eixo.current === 'x') {
          let deslocamento = gesto.dx;
          if ((indice === 0 && deslocamento > 0) || (indice === midias.length - 1 && deslocamento < 0)) {
            deslocamento *= 0.3;
          }
          translator.setValue(-indice * width + deslocamento);
        } else if (eixo.current === 'y' && gesto.dy > 0) {
          arrastoY.setValue(gesto.dy);
        }
      },
      onPanResponderRelease: (_, gesto) => {
        const direcao = eixo.current;
        eixo.current = null;

        if (direcao === 'y' && gesto.dy > 120) {
          fecharArrastando();
          return;
        }
        if (direcao === 'x' && Math.abs(gesto.dx) > 60) {
          irPara(indice + (gesto.dx < 0 ? 1 : -1));
          return;
        }
        voltarAoCentro();
      },
      onPanResponderTerminate: () => {
        eixo.current = null;
        voltarAoCentro();
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice, midias.length, width]);

  const escala = arrastoY.interpolate({
    inputRange: [0, 300],
    outputRange: [1, 0.8],
    extrapolate: 'clamp',
  });
  const escurecer = arrastoY.interpolate({
    inputRange: [0, 300],
    outputRange: [1, 0.25],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.raiz} {...responder.panHandlers}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: FUNDO, opacity: escurecer }]}
      />
      <Animated.View
        style={[styles.palco, { opacity: abertura, transform: [{ translateY: arrastoY }, { scale: escala }] }]}
      >
        <Animated.View
          style={[
            styles.trilha,
            { width: width * midias.length, transform: [{ translateX: translator }] },
          ]}
        >
          {midias.map((midia, posicao) => (
            <View key={`${midia.uri}-${posicao}`} style={[styles.slide, { width }]}>
              {midia.tipo === 'video' ? (
                <VideoSlide uri={midia.uri} ativo={posicao === indice} />
              ) : (
                <Image source={{ uri: midia.uri }} style={styles.midia} contentFit="contain" />
              )}
            </View>
          ))}
        </Animated.View>
      </Animated.View>

      <View style={[styles.barra, { top: insets.top + 8 }]} pointerEvents="box-none">
        <T estilo="headline" corHex="#FFFFFF" numberOfLines={1} style={styles.contador}>
          {midias.length > 1 ? `${indice + 1} de ${midias.length}` : ''}
        </T>
        <Pressable
          onPress={onFechar}
          accessibilityRole="button"
          accessibilityLabel="Fechar"
          style={styles.fechar}
        >
          <Icon name="close" tamanho={22} cor="#FFFFFF" />
        </Pressable>
      </View>

      {midias.length > 1 ? (
        <View style={[styles.pontos, { bottom: insets.bottom + 28 }]} pointerEvents="none">
          {midias.map((midia, posicao) => (
            <View
              key={`${midia.uri}-ponto-${posicao}`}
              style={[styles.ponto, posicao === indice ? styles.pontoAtivo : null]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    ...StyleSheet.absoluteFill,
    zIndex: 90,
    backgroundColor: 'rgba(0,0,0,0.001)',
  },
  palco: {
    ...StyleSheet.absoluteFill,
  },
  trilha: {
    flexDirection: 'row',
    height: '100%',
  },
  slide: {
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 100,
    paddingBottom: 60,
  },
  midia: {
    width: '100%',
    height: '100%',
  },
  barra: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  contador: {
    paddingLeft: 8,
  },
  fechar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pontos: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  ponto: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  pontoAtivo: {
    width: 16,
    backgroundColor: '#FFFFFF',
  },
});
