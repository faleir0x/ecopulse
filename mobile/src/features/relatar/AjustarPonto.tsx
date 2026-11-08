import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, T } from '@/components';
import type { TipoRisco } from '@/domain/tipos';
import type { Coordenada } from '@/features/localizacao';
import { estiloMapa } from '@/features/mapa/estiloMapa';
import { ICONE_TIPO } from '@/features/mapa/iconesTipo';
import { useEndereco } from '@/features/mapa/useEndereco';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, movimento, raio, tamanho } from '@/theme/tokens';

const MARGEM = 8;
const ZOOM_AJUSTE = 17;

const CURVA_SAIDA = Easing.bezier(
  movimento.curvas.out[0],
  movimento.curvas.out[1],
  movimento.curvas.out[2],
  movimento.curvas.out[3],
);

export type AjustarPontoProps = {
  inicial: Coordenada;
  tipo: TipoRisco | null;
  onCancelar: () => void;
  onUsar: (ponto: Coordenada) => void;
};

export function AjustarPonto({ inicial, tipo, onCancelar, onUsar }: AjustarPontoProps) {
  const { cor, esquema, reduzirMovimento } = useTema();
  const insets = useSafeAreaInsets();
  const [centro, setCentro] = useState<Coordenada>(inicial);
  const endereco = useEndereco(centro);
  const levantado = useSharedValue(0);

  const levantar = () => {
    levantado.value = reduzirMovimento
      ? 1
      : withTiming(1, { duration: 140, easing: CURVA_SAIDA });
  };

  const parar = (regiao: Region) => {
    setCentro({ latitude: regiao.latitude, longitude: regiao.longitude });
    levantado.value = reduzirMovimento
      ? 0
      : withSpring(0, { damping: 20, stiffness: 220, mass: 1 });
    void Haptics.selectionAsync().catch(() => undefined);
  };

  const estiloPino = useAnimatedStyle(() => ({
    transform: [{ translateY: -28 - levantado.value * 12 }],
  }));
  const estiloSombra = useAnimatedStyle(() => ({
    opacity: 1 - levantado.value * 0.6,
    transform: [{ scale: 1 - levantado.value * 0.45 }],
  }));

  const textoCentro =
    endereco ?? `${centro.latitude.toFixed(4)}, ${centro.longitude.toFixed(4)}`;

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={onCancelar}>
      <View style={styles.raiz}>
        <MapView
          // O Google Maps no Android não reaplica o customMapStyle ao trocar o tema: recria o mapa
          key={esquema}
          provider={PROVIDER_GOOGLE}
          customMapStyle={estiloMapa(esquema)}
          initialCamera={{
            center: inicial,
            zoom: ZOOM_AJUSTE,
            heading: 0,
            pitch: 0,
          }}
          style={StyleSheet.absoluteFill}
          toolbarEnabled={false}
          showsCompass={false}
          showsMyLocationButton={false}
          zoomControlEnabled={false}
          showsPointsOfInterests={false}
          onRegionChange={levantar}
          onRegionChangeComplete={parar}
          onPanDrag={levantar}
          testID="mapa-ajuste"
        />

        <View pointerEvents="none" style={[styles.pillArea, { top: insets.top + espaco.sm }]}>
          <View style={[styles.pill, { backgroundColor: cor.surface }]}>
            <Icon name="map-point" tamanho={tamanho.iconSm} cor={cor.textSecondary} />
            <T estilo="body" numberOfLines={1}>
              Arraste o mapa
            </T>
          </View>
        </View>

        <View pointerEvents="none" style={styles.centro}>
          <Animated.View
            style={[styles.sombra, { backgroundColor: cor.scrim }, estiloSombra]}
          />
          <Animated.View style={[styles.pino, estiloPino]}>
            <View style={[styles.circulo, { backgroundColor: cor.ink }]}>
              <Icon
                name={tipo ? ICONE_TIPO[tipo] : 'map-point'}
                tamanho={20}
                cor={cor.onInk}
              />
            </View>
            <View style={[styles.haste, { backgroundColor: cor.ink }]} />
            <View style={[styles.ponto, { backgroundColor: cor.ink }]} />
          </Animated.View>
        </View>

        <View
          style={[
            styles.sheet,
            {
              backgroundColor: cor.surface,
              bottom: insets.bottom + MARGEM,
              left: MARGEM,
              right: MARGEM,
            },
          ]}
        >
          <T estilo="title" numberOfLines={1}>
            Ajustar o ponto
          </T>

          <View style={styles.linha}>
            <View style={[styles.tile, { backgroundColor: cor.surfaceMuted }]}>
              <Icon name="map-point" tamanho={tamanho.icon} cor={cor.textPrimary} />
            </View>
            <T estilo="headline" tabular numberOfLines={1} style={styles.endereco}>
              {textoCentro}
            </T>
          </View>

          <View style={styles.botoes}>
            <Button
              rotulo="Cancelar"
              variante="secundario"
              onPress={onCancelar}
              estilo={styles.botao}
            />
            <Button rotulo="Usar este ponto" onPress={() => onUsar(centro)} estilo={styles.botao} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  pillArea: {
    position: 'absolute',
    left: espaco.gutter,
    right: espaco.gutter,
    zIndex: 10,
  },
  pill: {
    minHeight: tamanho.touch,
    borderRadius: raio.pill,
    paddingHorizontal: espaco.lg,
    paddingVertical: espaco.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
  },
  centro: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  sombra: {
    position: 'absolute',
    width: 12,
    height: 6,
    borderRadius: 3,
  },
  pino: {
    alignItems: 'center',
  },
  circulo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  haste: {
    width: 2,
    height: 16,
  },
  ponto: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sheet: {
    position: 'absolute',
    borderRadius: raio.reportSheet,
    padding: espaco.xl,
    gap: espaco.lg,
    zIndex: 10,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
  },
  tile: {
    width: tamanho.touch,
    height: tamanho.touch,
    borderRadius: raio.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endereco: {
    flex: 1,
    minWidth: 0,
  },
  botoes: {
    flexDirection: 'row',
    gap: espaco.sm,
  },
  botao: {
    flex: 1,
  },
});
