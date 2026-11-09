import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, EmptyRow, T } from '@/components';
import { ALTURA_TAB_BAR } from '@/components/TabBar';
import { tempoRelativo } from '@/features/mapa/tempo';
import { Icon } from '@/icons/Icon';
import { useAlertas } from '@/state/alertas';
import { useTema } from '@/theme/tema';
import { espaco, raio, tamanho } from '@/theme/tokens';

import { agruparPorDia } from './agrupar';
import { AlertRow } from './AlertRow';
import { usePermissaoNotificacao } from './permissao';

export function TelaAlertas() {
  const { alertas, naoLidos: naoLidosTotal, conexao, abrir, marcarTodosLidos } = useAlertas();
  const { cor } = useTema();
  const insets = useSafeAreaInsets();
  const dias = agruparPorDia(alertas);
  // Um dia por vez (o mais recente por padrão); os chips trocam a data
  const [chaveDia, setChaveDia] = useState<string | null>(null);
  const dia = dias.find((d) => d.chave === chaveDia) ?? dias[0] ?? null;
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
        <T estilo="large" cromo numberOfLines={1} style={styles.titulo}>
          Alertas
        </T>
        {alertas.length > 0 ? (
          <Pressable
            onPress={marcarTodosLidos}
            disabled={naoLidosTotal === 0}
            accessibilityRole="button"
            accessibilityState={{ disabled: naoLidosTotal === 0 }}
            hitSlop={8}
            style={({ pressed }) => [
              styles.lerTodos,
              {
                backgroundColor: cor.surfaceMuted,
                opacity: naoLidosTotal === 0 ? 0.45 : 1,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              },
            ]}
          >
            <Icon name="check-circle" tamanho={tamanho.iconSm} cor={cor.textPrimary} />
            <T estilo="headline" cromo numberOfLines={1} style={styles.lerTodosTexto}>
              Ler todos
            </T>
          </Pressable>
        ) : null}
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
          <>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              style={styles.chipsRolagem}
            >
              {dias.map((d) => {
                const ativo = d.chave === dia?.chave;
                const temNovo = d.itens.some((item) => !item.lido);
                return (
                  <Pressable
                    key={d.chave}
                    onPress={() => setChaveDia(d.chave)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: ativo }}
                    accessibilityLabel={`${d.rotulo}${temNovo ? ', com novos' : ''}`}
                    style={[styles.chip, { backgroundColor: ativo ? cor.ink : cor.surfaceMuted }]}
                  >
                    <T
                      estilo="headline"
                      cromo
                      numberOfLines={1}
                      style={[styles.chipTexto, { color: ativo ? cor.onInk : cor.textPrimary }]}
                    >
                      {d.rotulo}
                    </T>
                    {temNovo ? (
                      <View style={[styles.chipPonto, { backgroundColor: cor.accent }]} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            {dia && dia.itens.length === 0 ? (
              <Card estilo={[styles.lista, styles.listaSemNovos]}>
                <EmptyRow titulo="Nenhum alerta neste dia" icone="bell-off" />
              </Card>
            ) : dia ? (
              <>
                {dia.itens.some((item) => !item.lido) ? (
                  <View style={styles.grupoCabecalho}>
                    <T estilo="caption" cor="accent" cromo numberOfLines={1}>
                      {(() => {
                        const novos = dia.itens.filter((item) => !item.lido).length;
                        return novos === 1 ? '1 novo' : `${novos} novos`;
                      })()}
                    </T>
                  </View>
                ) : null}
                <Card
                  estilo={[
                    styles.lista,
                    dia.itens.every((item) => item.lido) ? styles.listaSemNovos : null,
                  ]}
                >
                  {dia.itens.map((item, indice) => (
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
              </>
            ) : null}
          </>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaco.md,
    paddingHorizontal: espaco.gutter,
  },
  titulo: {
    flexShrink: 1,
  },
  lerTodos: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: espaco.md,
    borderRadius: raio.pill,
  },
  lerTodosTexto: {
    fontSize: 15,
    lineHeight: 20,
  },
  chipsRolagem: {
    marginTop: espaco.lg,
    marginHorizontal: -espaco.gutter,
  },
  chips: {
    gap: espaco.sm,
    paddingHorizontal: espaco.gutter,
  },
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    borderRadius: raio.pill,
  },
  chipTexto: {
    fontSize: 15,
    lineHeight: 20,
  },
  chipPonto: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
    marginTop: espaco.md,
    marginBottom: espaco.sm,
    paddingHorizontal: espaco.xs,
  },
  lista: {
    overflow: 'hidden',
  },
  listaSemNovos: {
    marginTop: espaco.md,
  },
  divisor: {
    height: StyleSheet.hairlineWidth,
    marginLeft: espaco.gutter + 40 + espaco.md,
  },
});
