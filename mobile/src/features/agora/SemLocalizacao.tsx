import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, T } from '@/components';
import { ALTURA_TAB_BAR } from '@/components/TabBar';
import { pedirPermissao } from '@/features/localizacao';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, raio, tamanho } from '@/theme/tokens';

/** Aba Agora sem GPS e sem local escolhido: convida a permitir ou escolher um bairro. */
export function SemLocalizacao() {
  const { cor } = useTema();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.tela,
        {
          backgroundColor: cor.background,
          paddingTop: insets.top + espaco.sm,
          paddingBottom: ALTURA_TAB_BAR + insets.bottom,
        },
      ]}
    >
      <View style={styles.cabecalho}>
        <View style={styles.tituloLinha}>
          <Icon name="map-point" peso="bold" tamanho={tamanho.iconSm} cor={cor.textPrimary} />
          <T estilo="headline" cromo numberOfLines={1} style={styles.titulo}>
            Sem localização
          </T>
          <Icon name="alt-arrow-down" tamanho={tamanho.iconSm} cor={cor.textSecondary} />
        </View>
      </View>

      <View style={styles.centro}>
        <Card estilo={styles.cartao}>
          <View style={styles.cartaoInterno}>
            <View style={[styles.tile, { backgroundColor: cor.surfaceMuted }]}>
              <Icon name="map-point" tamanho={30} cor={cor.textPrimary} />
            </View>
            <T estilo="title" cromo style={styles.pergunta}>
              Onde você está?
            </T>
            <View style={styles.botoes}>
              <Button
                rotulo="Usar localização"
                icone="gps"
                onPress={() => void pedirPermissao()}
              />
              <Button
                rotulo="Escolher bairro"
                variante="secundario"
                icone="magnifer"
                onPress={() => router.navigate('/local')}
              />
            </View>
          </View>
        </Card>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: {
    flex: 1,
    paddingHorizontal: espaco.gutter,
  },
  cabecalho: {
    minHeight: tamanho.touch,
    justifyContent: 'center',
  },
  tituloLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  titulo: {
    flexShrink: 1,
    minWidth: 0,
  },
  centro: {
    flex: 1,
    justifyContent: 'center',
  },
  cartao: {
    width: '100%',
  },
  cartaoInterno: {
    padding: espaco.gutter,
    alignItems: 'center',
    gap: 10,
  },
  tile: {
    width: 64,
    height: 64,
    borderRadius: raio.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pergunta: {
    textAlign: 'center',
  },
  botoes: {
    alignSelf: 'stretch',
    gap: 10,
    marginTop: espaco.sm,
  },
});
