import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, EmptyRow, T } from '@/components';
import { ALTURA_TAB_BAR } from '@/components/TabBar';
import { tempoRelativo } from '@/features/mapa/tempo';
import { Icon } from '@/icons/Icon';
import { useAlertas } from '@/state/alertas';
import { useTema } from '@/theme/tema';
import { espaco, raio, tamanho } from '@/theme/tokens';

import { agruparAlertas } from './agrupar';
import { AlertRow } from './AlertRow';
import { usePermissaoNotificacao } from './permissao';

export function TelaAlertas() {
  const { alertas, conexao, abrir } = useAlertas();
  const { cor } = useTema();
  const insets = useSafeAreaInsets();
  const grupos = agruparAlertas(alertas);
  const { permissao, ativar } = usePermissaoNotificacao();

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
        {permissao === 'negada' ? (
          <Card estilo={styles.desligadas}>
            <Icon name="bell-off" tamanho={tamanho.icon} cor={cor.textPrimary} />
            <T estilo="headline" cromo numberOfLines={2} style={styles.desligadasTexto}>
              Notificações desligadas
            </T>
            <Pressable
              onPress={() => void ativar()}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.ativar,
                { backgroundColor: cor.ink, transform: [{ scale: pressed ? 0.97 : 1 }] },
              ]}
            >
              <T estilo="headline" cromo style={[styles.ativarTexto, { color: cor.onInk }]}>
                Ativar
              </T>
            </Pressable>
          </Card>
        ) : null}

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
              icone="bell-off"
              acao={{ rotulo: 'Ajustar alertas', onPress: () => router.navigate('/ajustes') }}
            />
          </Card>
        ) : (
          grupos.map((grupo) => {
            const naoLidos = grupo.itens.filter((item) => !item.lido).length;

            return (
              <View key={grupo.rotulo}>
                <View style={styles.grupoCabecalho}>
                  <T estilo="headline" cromo numberOfLines={2} style={styles.grupoTitulo}>
                    {grupo.rotulo}
                  </T>
                  {naoLidos > 0 ? (
                    <T estilo="caption" cor="accent" cromo numberOfLines={1}>
                      {naoLidos === 1 ? '1 novo' : `${naoLidos} novos`}
                    </T>
                  ) : null}
                </View>
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
            );
          })
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
  desligadas: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingVertical: espaco.md,
    paddingLeft: 14,
    paddingRight: espaco.md,
    marginTop: espaco.sm,
  },
  desligadasTexto: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
  },
  ativar: {
    height: tamanho.touch,
    paddingHorizontal: espaco.lg,
    borderRadius: raio.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ativarTexto: {
    fontSize: 15,
    lineHeight: 20,
  },
  reconectando: {
    paddingHorizontal: espaco.xs,
    paddingTop: espaco.sm,
  },
  vazio: {
    marginTop: espaco.lg,
    overflow: 'hidden',
  },
  grupoCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaco.md,
    marginTop: espaco.xl,
    marginBottom: espaco.sm,
    paddingHorizontal: espaco.xs,
  },
  grupoTitulo: {
    fontSize: 15,
    lineHeight: 20,
    flexShrink: 1,
    minWidth: 0,
  },
  lista: {
    overflow: 'hidden',
  },
  divisor: {
    height: StyleSheet.hairlineWidth,
    marginLeft: espaco.gutter + 40 + espaco.md,
  },
});
