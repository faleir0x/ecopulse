import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { T } from '@/components';
import type { MidiaLocal } from '@/data/outbox';
import { Icon } from '@/icons/Icon';
import type { NomeIcone } from '@/icons';
import { useTema } from '@/theme/tema';
import { espaco, movimento, raio, tamanho } from '@/theme/tokens';

import { MediaThumb } from './MediaThumb';

export const MAX_MIDIAS = 3;

const CURVA_ENTRADA = Easing.bezier(
  movimento.curvas.out[0],
  movimento.curvas.out[1],
  movimento.curvas.out[2],
  movimento.curvas.out[3],
);
const DESLOCAMENTO_ENTRADA = 6;

type ErroMidia = 'camera' | 'galeria' | 'falha';

type BotaoExtraProps = {
  icone: NomeIcone;
  rotulo: string;
  ativo?: boolean;
  expandido?: boolean;
  desabilitado?: boolean;
  onPress: () => void;
};

function BotaoExtra({
  icone,
  rotulo,
  ativo = false,
  expandido,
  desabilitado = false,
  onPress,
}: BotaoExtraProps) {
  const { cor } = useTema();
  const frente = ativo ? cor.textPrimary : cor.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={{ disabled: desabilitado, expanded: expandido }}
      style={({ pressed }) => [
        styles.extra,
        {
          borderColor: ativo ? cor.textSecondary : cor.line,
          opacity: desabilitado ? 0.45 : pressed ? 0.8 : 1,
        },
      ]}
    >
      <Icon name={icone} tamanho={tamanho.iconSm + 2} cor={frente} />
      <T estilo="headline" cromo numberOfLines={1} corHex={frente} style={styles.extraRotulo}>
        {rotulo}
      </T>
    </Pressable>
  );
}

/** Linha que entra com fade e leve subida; trocar a chave refaz a entrada (troca no lugar). */
function LinhaAnimada({ children }: { children: ReactNode }) {
  const { reduzirMovimento } = useTema();
  const opacidade = useSharedValue(0);
  const deslocamento = useSharedValue(reduzirMovimento ? 0 : DESLOCAMENTO_ENTRADA);

  useEffect(() => {
    const duracao = reduzirMovimento ? 150 : 200;
    opacidade.value = withTiming(1, { duration: duracao, easing: CURVA_ENTRADA });
    deslocamento.value = reduzirMovimento
      ? 0
      : withTiming(0, { duration: duracao, easing: CURVA_ENTRADA });
  }, [reduzirMovimento, opacidade, deslocamento]);

  const estiloEntrada = useAnimatedStyle(() => ({
    opacity: opacidade.value,
    transform: [{ translateY: deslocamento.value }],
  }));

  return <Animated.View style={[styles.linha, estiloEntrada]}>{children}</Animated.View>;
}

function LinhaErro({ erro }: { erro: ErroMidia }) {
  if (erro === 'falha') {
    return (
      <T estilo="caption" cor="textSecondary" style={styles.erro}>
        Não abriu. Tente de novo.
      </T>
    );
  }

  return (
    <T estilo="caption" cor="textSecondary" style={styles.erro}>
      {erro === 'camera' ? 'Sem acesso à câmera' : 'Sem acesso às fotos'} ·{' '}
      <T
        estilo="caption"
        cor="textSecondary"
        onPress={() => void Linking.openSettings()}
        accessibilityRole="button"
        accessibilityLabel="Ativar nas configurações"
        style={styles.ativar}
      >
        Ativar
      </T>{' '}
      nas configurações
    </T>
  );
}

function converter(asset: ImagePicker.ImagePickerAsset): MidiaLocal {
  return { uri: asset.uri, tipo: asset.type === 'video' ? 'video' : 'imagem' };
}

export type MediaPickerProps = {
  midias: MidiaLocal[];
  notaAberta: boolean;
  onToggleNota: () => void;
  onAdicionar: (novas: MidiaLocal[]) => void;
  onRemover: (indice: number) => void;
  onAbrir: (indice: number) => void;
};

export function MediaPicker({
  midias,
  notaAberta,
  onToggleNota,
  onAdicionar,
  onRemover,
  onAbrir,
}: MediaPickerProps) {
  const { cor } = useTema();
  const cheio = midias.length >= MAX_MIDIAS;
  const rotuloFoto = midias.length > 0 ? `Foto · ${midias.length}/${MAX_MIDIAS}` : 'Foto';

  const [opcoesAbertas, setOpcoesAbertas] = useState(false);
  const [erro, setErro] = useState<ErroMidia | null>(null);

  const escolher = async (origem: 'camera' | 'galeria') => {
    const restantes = MAX_MIDIAS - midias.length;
    if (restantes <= 0) {
      return;
    }

    setErro(null);

    try {
      const permissao =
        origem === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissao.status !== 'granted') {
        setErro(origem);
        return;
      }

      const resultado =
        origem === 'camera'
          ? await ImagePicker.launchCameraAsync({
              mediaTypes: ['images', 'videos'],
              quality: 0.8,
              videoMaxDuration: 60,
            })
          : await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images', 'videos'],
              allowsMultipleSelection: true,
              selectionLimit: restantes,
              quality: 0.8,
            });

      setOpcoesAbertas(false);
      if (resultado.canceled) {
        return;
      }

      const novas = resultado.assets.slice(0, restantes).map(converter);
      if (novas.length > 0) {
        onAdicionar(novas);
      }
    } catch {
      setErro('falha');
    }
  };

  const alternarOpcoes = () => {
    if (cheio) {
      return;
    }
    setErro(null);
    setOpcoesAbertas((aberta) => !aberta);
  };

  return (
    <View style={styles.raiz}>
      {/* "Foto" vira "Câmera · Galeria · ×" no mesmo lugar: a sheet não muda de altura */}
      {opcoesAbertas ? (
        <LinhaAnimada key="opcoes">
          <BotaoExtra
            icone="camera-minimalistic"
            rotulo="Câmera"
            ativo
            onPress={() => void escolher('camera')}
          />
          <BotaoExtra
            icone="gallery-minimalistic"
            rotulo="Galeria"
            ativo
            onPress={() => void escolher('galeria')}
          />
          <Pressable
            onPress={alternarOpcoes}
            accessibilityRole="button"
            accessibilityLabel="Fechar opções de foto"
            style={({ pressed }) => [
              styles.fechar,
              { backgroundColor: cor.surfaceMuted, transform: [{ scale: pressed ? 0.95 : 1 }] },
            ]}
          >
            <Icon name="close" tamanho={tamanho.iconSm} cor={cor.textSecondary} />
          </Pressable>
        </LinhaAnimada>
      ) : (
        <LinhaAnimada key="extras">
          <BotaoExtra
            icone="camera-minimalistic"
            rotulo={rotuloFoto}
            ativo={midias.length > 0}
            expandido={false}
            desabilitado={cheio}
            onPress={alternarOpcoes}
          />
          <BotaoExtra icone="pen" rotulo="Detalhe" ativo={notaAberta} onPress={onToggleNota} />
        </LinhaAnimada>
      )}

      {erro ? <LinhaErro erro={erro} /> : null}

      {midias.length > 0 ? (
        <View style={styles.miniaturas}>
          {midias.map((midia, indice) => (
            <MediaThumb
              key={`${midia.uri}-${indice}`}
              midia={midia}
              indice={indice}
              onRemover={onRemover}
              onAbrir={onAbrir}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    gap: espaco.sm,
  },
  linha: {
    flexDirection: 'row',
    gap: espaco.sm,
  },
  extra: {
    flex: 1,
    minWidth: 0,
    height: tamanho.touch,
    borderRadius: raio.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaco.sm,
  },
  extraRotulo: {
    fontSize: 14,
    lineHeight: 18,
    flexShrink: 1,
    minWidth: 0,
  },
  fechar: {
    width: tamanho.touch,
    height: tamanho.touch,
    borderRadius: tamanho.touch / 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  erro: {
    paddingHorizontal: espaco.xs,
  },
  ativar: {
    textDecorationLine: 'underline',
  },
  miniaturas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm,
    paddingTop: espaco.xs,
  },
});
