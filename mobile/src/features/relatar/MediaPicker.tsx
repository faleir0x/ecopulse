import * as ImagePicker from 'expo-image-picker';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/components';
import type { MidiaLocal } from '@/data/outbox';
import { Icon } from '@/icons/Icon';
import type { NomeIcone } from '@/icons';
import { useTema } from '@/theme/tema';
import { espaco, raio, tamanho } from '@/theme/tokens';

import { MediaThumb } from './MediaThumb';

export const MAX_MIDIAS = 3;

type BotaoExtraProps = {
  icone: NomeIcone;
  rotulo: string;
  ativo?: boolean;
  desabilitado?: boolean;
  onPress: () => void;
};

function BotaoExtra({ icone, rotulo, ativo = false, desabilitado = false, onPress }: BotaoExtraProps) {
  const { cor } = useTema();
  const frente = ativo ? cor.textPrimary : cor.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      disabled={desabilitado}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      accessibilityState={{ disabled: desabilitado }}
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
  const cheio = midias.length >= MAX_MIDIAS;
  const rotuloFoto = midias.length > 0 ? `Foto · ${midias.length}/${MAX_MIDIAS}` : 'Foto';

  const escolher = async (origem: 'camera' | 'galeria') => {
    const restantes = MAX_MIDIAS - midias.length;
    if (restantes <= 0) {
      return;
    }

    try {
      const permissao =
        origem === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissao.status !== 'granted') {
        Alert.alert(
          'Permissão necessária',
          origem === 'camera'
            ? 'Autorize a câmera para tirar fotos e vídeos.'
            : 'Autorize o acesso às fotos para escolher mídias.',
        );
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

      if (resultado.canceled) {
        return;
      }

      const novas = resultado.assets.slice(0, restantes).map(converter);
      if (novas.length > 0) {
        onAdicionar(novas);
      }
    } catch {
      Alert.alert('Não foi possível abrir a mídia', 'Tente de novo.');
    }
  };

  const abrirOpcoes = () => {
    if (cheio) {
      return;
    }
    Alert.alert('Foto', 'Escolha a origem', [
      { text: 'Câmera', onPress: () => void escolher('camera') },
      { text: 'Galeria', onPress: () => void escolher('galeria') },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.raiz}>
      <View style={styles.linha}>
        <BotaoExtra
          icone="camera-minimalistic"
          rotulo={rotuloFoto}
          ativo={midias.length > 0}
          desabilitado={cheio}
          onPress={abrirOpcoes}
        />
        <BotaoExtra
          icone="pen"
          rotulo="Detalhe"
          ativo={notaAberta}
          onPress={onToggleNota}
        />
      </View>
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
  miniaturas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.sm,
    paddingTop: espaco.xs,
  },
});
