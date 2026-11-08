import type { BottomTabBarProps } from 'expo-router/tabs';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Button,
  Card,
  EmptyRow,
  Fab,
  InlineError,
  MiniSegmented,
  NoReading,
  OfflinePill,
  PageError,
  Pill,
  ScrollEdge,
  SectionHeader,
  SegmentedFilter,
  SeverityLabel,
  SeverityMeter,
  Skeleton,
  Switch,
  TabBar,
  T,
  ThresholdRuler,
  TypeIcon,
} from '@/components';
import { ROTULO_TIPO, SEVERIDADES, TIPOS_RISCO, type Severidade } from '@/domain/tipos';
import { TemaProvider, useTema } from '@/theme/tema';
import { espaco, raio } from '@/theme/tokens';

const ROTAS = ['index', 'mapa', 'alertas', 'ajustes'] as const;
const TITULOS = ['Agora', 'Mapa', 'Alertas', 'Ajustes'];

function TabBarDemo() {
  const [indice, setIndice] = useState(0);
  const rotas = ROTAS.map((nome, i) => ({
    key: `${nome}-${i}`,
    name: nome,
    params: undefined,
    path: undefined,
  }));
  const descritores = Object.fromEntries(
    rotas.map((rota, i) => [
      rota.key,
      {
        options: {
          title: TITULOS[i],
          tabBarBadge: rota.name === 'alertas' ? 2 : undefined,
        },
        route: rota,
      },
    ]),
  );

  const props = {
    state: {
      index: indice,
      routes: rotas,
      routeNames: [...ROTAS],
      key: 'catalogo-tabs',
      type: 'tab',
      stale: false,
      history: [],
    },
    descriptors: descritores,
    navigateToTab: (chave: string) => {
      const alvo = rotas.findIndex((rota) => rota.key === chave);
      if (alvo >= 0) setIndice(alvo);
    },
    emitter: {
      emit: () => ({ defaultPrevented: false }),
    },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  } as unknown as BottomTabBarProps;

  return <TabBar {...props} />;
}

function Demonstracao() {
  const { cor, esquema } = useTema();
  const [filtro, setFiltro] = useState('tudo');
  const [mini, setMini] = useState('500');
  const [ligado, setLigado] = useState(true);
  const [limiar, setLimiar] = useState<Severidade>('moderado');
  const [tipoAtivo, setTipoAtivo] = useState('alagamento');

  return (
    <View
      style={{
        gap: espaco.md,
        padding: espaco.md,
        borderRadius: raio.card,
        backgroundColor: cor.background,
      }}
    >
      <T estilo="large" cromo numberOfLines={1}>
        {esquema === 'claro' ? 'Tema claro' : 'Tema escuro'}
      </T>

      <SectionHeader titulo="Severidade" acao={{ rotulo: 'Ver tudo', onPress: () => undefined }} />
      <Card estilo={{ padding: espaco.gutter, gap: espaco.lg }}>
        <View style={styles.linha}>
          {SEVERIDADES.map((nivel) => (
            <View key={nivel} style={styles.par}>
              <SeverityMeter severidade={nivel} tamanho="s" />
              <SeverityLabel severidade={nivel} estilo="caption" />
            </View>
          ))}
        </View>
        <View style={styles.linha}>
          <SeverityMeter severidade={null} />
          <SeverityMeter severidade="alto" tamanho="s" />
          <SeverityMeter severidade="alto" tamanho="m" />
          <SeverityMeter severidade="critico" tamanho="l" />
        </View>
      </Card>

      <SectionHeader titulo="Navegação" />
      <Card estilo={{ paddingVertical: espaco.sm }}>
        <TabBarDemo />
      </Card>
      <View style={[styles.linha, { justifyContent: 'flex-start' }]}>
        <Fab onPress={() => undefined} rotulo="Relatar" />
        <Pill rotulo="Com ícone" icone="refresh" onPress={() => undefined} />
        <Pill rotulo="Estático" />
      </View>

      <SectionHeader titulo="Filtros e ajustes" />
      <Card estilo={{ padding: espaco.gutter, gap: espaco.lg }}>
        <SegmentedFilter
          opcoes={[
            { valor: 'tudo', rotulo: 'Tudo', icone: 'layers-minimalistic' },
            { valor: 'alagamento', rotulo: 'Alagamento', icone: 'cloud-waterdrops' },
            { valor: 'calor', rotulo: 'Calor', icone: 'temperature' },
            { valor: 'ar', rotulo: 'Ar', icone: 'wind' },
          ]}
          valor={filtro}
          onChange={setFiltro}
        />
        <View style={styles.linha}>
          <MiniSegmented
            opcoes={[
              { valor: '500', rotulo: '500 m' },
              { valor: '1000', rotulo: '1 km' },
              { valor: '2000', rotulo: '2 km' },
            ]}
            valor={mini}
            onChange={setMini}
          />
          <Switch valor={ligado} onChange={setLigado} rotulo="Avisos" />
        </View>
        <ThresholdRuler valor={limiar} onChange={setLimiar} />
      </Card>

      <SectionHeader titulo="Ações" />
      <Card estilo={{ padding: espaco.gutter, gap: espaco.md }}>
        <Button rotulo="Primário" onPress={() => undefined} />
        <Button rotulo="Secundário" variante="secundario" onPress={() => undefined} />
        <Button rotulo="Desabilitado" desabilitado onPress={() => undefined} />
        <Button rotulo="Carregando" carregando onPress={() => undefined} />
        <Button rotulo="Com ícone" icone="refresh" onPress={() => undefined} />
      </Card>

      <SectionHeader titulo="Tipos" />
      <Card estilo={{ padding: espaco.gutter, gap: espaco.md }}>
        {TIPOS_RISCO.map((tipo) => (
          <View key={tipo} style={styles.linha}>
            <Pill rotulo={ROTULO_TIPO[tipo]} onPress={() => setTipoAtivo(tipo)} />
            <View style={styles.icones}>
              <TypeIcon tipo={tipo} />
              <TypeIcon tipo={tipo} ativo={tipoAtivo === tipo} />
            </View>
          </View>
        ))}
      </Card>

      <SectionHeader titulo="Carregando" />
      <Card estilo={{ padding: espaco.gutter, gap: espaco.sm }}>
        <Skeleton largura="70%" altura={16} />
        <Skeleton largura="45%" altura={12} />
        <Skeleton largura={120} altura={64} raio={raio.card} />
      </Card>

      <SectionHeader titulo="Estados de dados" />
      <Card estilo={{ overflow: 'hidden' }}>
        <InlineError onTentar={() => undefined} />
        <EmptyRow titulo="Nenhum risco por perto" acao={{ rotulo: 'Relatar', onPress: () => undefined }} />
        <View style={{ padding: espaco.gutter }}>
          <NoReading />
        </View>
      </Card>
      <Card>
        <PageError compacta onTentar={() => undefined} />
      </Card>
      <Card>
        <PageError onTentar={() => undefined} />
      </Card>

      <SectionHeader titulo="Offline e borda" />
      <View style={{ gap: espaco.md, alignItems: 'center' }}>
        <OfflinePill pendentes={1} />
        <OfflinePill pendentes={4} />
      </View>
      <View
        style={{
          height: 88,
          borderRadius: raio.card,
          overflow: 'hidden',
          backgroundColor: cor.surface,
        }}
      >
        <ScrollEdge visivel />
        <View style={{ padding: espaco.gutter }}>
          <T estilo="body" numberOfLines={1}>
            Conteúdo sob a borda
          </T>
        </View>
      </View>
    </View>
  );
}

export default function CatalogoScreen() {
  const { cor } = useTema();

  return (
    <ScrollView
      style={[styles.tela, { backgroundColor: cor.background }]}
      contentContainerStyle={styles.conteudo}
      keyboardShouldPersistTaps="handled"
    >
      <T estilo="title" numberOfLines={1}>
        Catálogo de componentes
      </T>
      <View style={styles.temas}>
        <View style={styles.coluna}>
          <TemaProvider inicial="escuro">
            <Demonstracao />
          </TemaProvider>
        </View>
        <View style={styles.coluna}>
          <TemaProvider inicial="claro">
            <Demonstracao />
          </TemaProvider>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tela: {
    flex: 1,
  },
  conteudo: {
    padding: espaco.gutter,
    gap: espaco.xl,
  },
  temas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: espaco.gutter,
    alignItems: 'flex-start',
  },
  coluna: {
    flexGrow: 1,
    flexBasis: 300,
    minWidth: 280,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: espaco.md,
  },
  par: {
    alignItems: 'center',
    gap: espaco.xs,
  },
  icones: {
    flexDirection: 'row',
    gap: espaco.md,
  },
});
