import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Card, T } from '@/components';
import type { MidiaLocal } from '@/data/outbox';
import { MediaViewer } from '@/features/relatar/MediaViewer';
import { Icon } from '@/icons/Icon';
import { useRelatos } from '@/state/relatos';
import { useUi } from '@/state/ui';
import { useTema } from '@/theme/tema';
import { espaco, tamanho } from '@/theme/tokens';

import { RelatoRow } from './RelatoRow';

type Visualizador = { midias: MidiaLocal[]; indice: number };

export function TelaMeusRelatos() {
  const { meus, encerrar } = useRelatos();
  const { setRelatarAberto } = useUi();
  const { cor } = useTema();
  const insets = useSafeAreaInsets();
  const [visualizador, setVisualizador] = useState<Visualizador | null>(null);

  const relatar = () => {
    setRelatarAberto(true);
    router.back();
  };

  return (
    <View style={[styles.raiz, { backgroundColor: cor.background }]}>
      <View style={[styles.cabecalho, { paddingTop: insets.top + espaco.sm }]}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          style={[styles.voltar, { backgroundColor: cor.surfaceMuted }]}
        >
          <Icon name="alt-arrow-left" tamanho={tamanho.icon} cor={cor.textPrimary} />
        </Pressable>
        <T estilo="title" cromo numberOfLines={1} style={styles.tituloTela}>
          Meus relatos
        </T>
      </View>

      <ScrollView contentContainerStyle={[styles.conteudo, { paddingBottom: insets.bottom + espaco.xl }]}>
        {meus.length === 0 ? (
          <View style={styles.vazio}>
            <Icon name="history" tamanho={40} cor={cor.textTertiary} />
            <T estilo="headline" cromo numberOfLines={2} style={styles.vazioTitulo}>
              Nenhum relato ainda
            </T>
            <Button rotulo="Relatar" variante="secundario" onPress={relatar} />
          </View>
        ) : (
          <Card estilo={styles.lista}>
            {meus.map((relato, indice) => (
              <View key={relato.client_id}>
                {indice > 0 ? <View style={[styles.divisor, { backgroundColor: cor.line }]} /> : null}
                <RelatoRow
                  relato={relato}
                  onEncerrar={encerrar}
                  onAbrirMidia={(midias, posicao) => setVisualizador({ midias, indice: posicao })}
                />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      {visualizador ? (
        <MediaViewer
          midias={visualizador.midias}
          indiceInicial={visualizador.indice}
          onFechar={() => setVisualizador(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingHorizontal: espaco.gutter,
    paddingBottom: espaco.sm,
  },
  voltar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  tituloTela: {
    flexShrink: 1,
    minWidth: 0,
  },
  conteudo: {
    paddingHorizontal: espaco.gutter,
    paddingTop: espaco.sm,
  },
  vazio: {
    alignItems: 'center',
    gap: espaco.lg,
    paddingTop: espaco.xxl,
    paddingHorizontal: espaco.xl,
  },
  vazioTitulo: {
    textAlign: 'center',
  },
  lista: {
    overflow: 'hidden',
  },
  divisor: {
    height: StyleSheet.hairlineWidth,
    marginLeft: espaco.gutter + 40 + espaco.md,
  },
});
