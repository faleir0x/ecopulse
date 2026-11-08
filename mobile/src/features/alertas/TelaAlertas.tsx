import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, EmptyRow, SectionHeader, T } from '@/components';
import { ALTURA_TAB_BAR } from '@/components/TabBar';
import { tempoRelativo } from '@/features/mapa/tempo';
import { useAlertas } from '@/state/alertas';
import { useTema } from '@/theme/tema';
import { espaco } from '@/theme/tokens';

import { agruparAlertas } from './agrupar';
import { AlertRow } from './AlertRow';

export function TelaAlertas() {
  const { alertas, conexao, abrir } = useAlertas();
  const { cor } = useTema();
  const insets = useSafeAreaInsets();
  const grupos = agruparAlertas(alertas);

  return (
    <ScrollView
      style={[styles.tela, { backgroundColor: cor.background }]}
      contentContainerStyle={{
        paddingTop: insets.top + espaco.sm,
        paddingBottom: ALTURA_TAB_BAR + insets.bottom + espaco.lg,
      }}
    >
      <View style={styles.cabecalho}>
        <T estilo="large" cromo numberOfLines={1}>
          Alertas
        </T>
      </View>

      <View style={styles.conteudo}>
        {conexao !== 'conectado' ? (
          <T
            estilo="caption"
            cor="textTertiary"
            numberOfLines={1}
            accessibilityLiveRegion="polite"
            style={styles.reconectando}
          >
            Reconectando…
          </T>
        ) : null}

        {alertas.length === 0 ? (
          <Card estilo={styles.vazio}>
            <EmptyRow
              titulo="Nenhum alerta"
              acao={{ rotulo: 'Ajustar alertas', onPress: () => router.navigate('/ajustes') }}
            />
          </Card>
        ) : (
          grupos.map((grupo) => (
            <View key={grupo.rotulo}>
              <SectionHeader titulo={grupo.rotulo} />
              <Card estilo={styles.lista}>
                {grupo.itens.map((item, indice) => (
                  <View key={item.chave}>
                    {indice > 0 ? (
                      <View style={[styles.divisor, { backgroundColor: cor.line }]} />
                    ) : null}
                    <AlertRow
                      item={item}
                      tempo={tempoRelativo(item.recebidoEm)}
                      onPress={() => abrir(item)}
                    />
                  </View>
                ))}
              </Card>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tela: {
    flex: 1,
  },
  cabecalho: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: espaco.gutter,
  },
  conteudo: {
    paddingHorizontal: espaco.gutter,
  },
  reconectando: {
    paddingHorizontal: espaco.xs,
    paddingTop: espaco.sm,
  },
  vazio: {
    marginTop: espaco.lg,
    overflow: 'hidden',
  },
  lista: {
    overflow: 'hidden',
  },
  divisor: {
    height: StyleSheet.hairlineWidth,
    marginLeft: espaco.gutter + 40 + espaco.md,
  },
});
