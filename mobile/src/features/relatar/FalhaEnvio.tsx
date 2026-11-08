import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Button, T } from '@/components';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, movimento, raio, tamanho } from '@/theme/tokens';

const CURVA_SAIDA = Easing.bezier(
  movimento.curvas.out[0],
  movimento.curvas.out[1],
  movimento.curvas.out[2],
  movimento.curvas.out[3],
);

export type FalhaEnvioProps = {
  tipo: 'na_fila' | 'rejeitado';
  carregando: boolean;
  onFechar: () => void;
  onTentarDeNovo: () => void;
};

export function FalhaEnvio({ tipo, carregando, onFechar, onTentarDeNovo }: FalhaEnvioProps) {
  const { cor, reduzirMovimento } = useTema();
  const entrada = useSharedValue(reduzirMovimento ? 1 : 0);

  useEffect(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (reduzirMovimento) {
      entrada.value = 1;
      return;
    }
    entrada.value = 0;
    entrada.value = withTiming(1, {
      duration: movimento.entrada.ms,
      easing: CURVA_SAIDA,
    });
  }, [entrada, reduzirMovimento]);

  const estiloEntrada = useAnimatedStyle(() => ({
    opacity: entrada.value,
    transform: [{ translateY: (1 - entrada.value) * movimento.entrada.deslocamentoY }],
  }));

  return (
    <View style={styles.raiz}>
      <Animated.View
        style={[styles.bloco, { backgroundColor: cor.surfaceMuted }, estiloEntrada]}
      >
        <Icon name="cloud-cross" tamanho={tamanho.icon} cor={cor.textPrimary} />
        <View style={styles.textos}>
          <T estilo="headline" numberOfLines={1}>
            Não enviado
          </T>
          <T estilo="caption" cor="textSecondary" numberOfLines={1}>
            {tipo === 'rejeitado' ? 'O servidor recusou este relato' : 'Fica na fila e sai sozinho'}
          </T>
        </View>
      </Animated.View>

      <View style={styles.rodape}>
        <Button
          rotulo="Fechar"
          variante="secundario"
          onPress={onFechar}
          estilo={styles.botao}
        />
        {tipo === 'na_fila' ? (
          <Button
            rotulo="Tentar de novo"
            onPress={onTentarDeNovo}
            carregando={carregando}
            estilo={styles.botao}
          />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    gap: espaco.lg,
  },
  bloco: {
    borderRadius: raio.chip,
    padding: espaco.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
  },
  textos: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rodape: {
    flexDirection: 'row',
    gap: espaco.sm,
    marginTop: espaco.xs,
  },
  botao: {
    flex: 1,
  },
});
