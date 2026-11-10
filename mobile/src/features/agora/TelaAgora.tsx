import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OfflinePill } from '@/components/OfflinePill';
import { PageError } from '@/components/PageError';
import { ScrollEdge } from '@/components/ScrollEdge';
import { SectionHeader } from '@/components/SectionHeader';
import { Skeleton } from '@/components/Skeleton';
import { T } from '@/components/T';
import { ALTURA_TAB_BAR } from '@/components/TabBar';
import { useAmbiente } from '@/features/agora/ambiente';
import { useAjustes } from '@/state/ajustes';
import { useRelatos } from '@/state/relatos';
import { useUi } from '@/state/ui';
import { CENTRO_SAO_PAULO } from '@/features/mapa/constantes';
import { useEndereco } from '@/features/mapa/useEndereco';
import { useLocalizacao } from '@/features/localizacao';
import { useOcorrencias } from '@/features/ocorrencias';
import { formatarDistancia } from '@/lib/distancia';
import { useTema } from '@/theme/tema';
import { espaco, raio } from '@/theme/tokens';

import { AqiGauge } from './AqiGauge';
import { Cabecalho } from './Cabecalho';
import { bboxDoRaio, nivelArMedido, nivelCalorMedido } from './escalas';
import { Entrada } from './Entrada';
import { HourlyStrip } from './HourlyStrip';
import { InversaoCard } from './InversaoCard';
import { OcorrenciasTop } from './OcorrenciasTop';
import { Presenca } from './Presenca';
import { RainCard } from './RainCard';
import { WindCard } from './WindCard';
import { RiskSummary } from './RiskSummary';
import { SemLocalizacao } from './SemLocalizacao';
import { TempHero } from './TempHero';
import { TempRange } from './TempRange';

function TituloSecao({ titulo, detalhe }: { titulo: string; detalhe: string }) {
  return (
    <View style={styles.tituloSecao}>
      <T estilo="headline" cromo numberOfLines={2} style={styles.tituloSecaoTexto}>
        {titulo}
      </T>
      <T estilo="caption" cor="textTertiary" numberOfLines={1}>
        {detalhe}
      </T>
    </View>
  );
}

function EsqueletoAgora() {
  return (
    <View style={styles.esqueleto}>
      <View style={styles.esqueletoCabecalho}>
        <View style={styles.esqueletoLocal}>
          <Skeleton largura="55%" altura={16} />
          <Skeleton largura="40%" altura={12} />
        </View>
        <Skeleton largura={44} altura={44} raio={22} />
      </View>

      <View style={styles.esqueletoHeroi}>
        <Skeleton largura={170} altura={96} raio={18} />
        <View style={styles.esqueletoCondicao}>
          <Skeleton largura={40} altura={40} raio={12} />
          <Skeleton largura={120} altura={14} />
        </View>
      </View>

      <Skeleton largura="100%" altura={6} raio={3} />
      <Skeleton largura="100%" altura={112} raio={raio.card} />
      <View style={styles.esqueletoDuo}>
        <Skeleton largura="48%" altura={170} raio={raio.card} />
        <Skeleton largura="48%" altura={170} raio={raio.card} />
      </View>
    </View>
  );
}

/** Aba Agora (tela inicial) do design v6. */
export function TelaAgora() {
  const { cor } = useTema();
  const insets = useSafeAreaInsets();
  const { raioM } = useAjustes();
  const { estado } = useRelatos();
  const { setOcorrenciaFoco, setRelatarAberto } = useUi();

  const [rolou, setRolou] = useState(false);
  const localizacao = useLocalizacao();
  const temLocalizacao = localizacao.status === 'ok';
  const semLocalizacao = localizacao.status === 'negada' || localizacao.status === 'indisponivel';
  const origem = temLocalizacao ? localizacao.coords : CENTRO_SAO_PAULO;
  const coordsAmbiente = temLocalizacao ? localizacao.coords : null;
  const nomeEscolhido =
    localizacao.status === 'ok' && localizacao.escolhida ? localizacao.nome : null;

  const ambiente = useAmbiente(coordsAmbiente);
  const endereco = useEndereco(coordsAmbiente, 'bairro');
  const cidade = useEndereco(coordsAmbiente, 'cidade');
  const bbox = useMemo(
    () => (semLocalizacao ? null : bboxDoRaio(origem, raioM)),
    [origem, raioM, semLocalizacao],
  );
  const ocorrencias = useOcorrencias(bbox, null);

  const leitura = ambiente.data ?? null;
  const carregando =
    localizacao.status === 'carregando' ||
    (temLocalizacao && ambiente.isPending && ambiente.data === undefined);

  // "Perto de você" também considera o que foi medido (ar e calor), não só os relatos
  const aqiAtual = leitura?.aqi ?? null;
  const sensacaoAtual = leitura?.sensacao ?? null;
  const medido = useMemo(
    () => ({
      qualidade_ar: nivelArMedido(aqiAtual),
      calor: nivelCalorMedido(sensacaoAtual),
    }),
    [aqiAtual, sensacaoAtual],
  );

  const tentarTudo = () => {
    void ambiente.refetch();
    void ocorrencias.refetch();
  };

  // Puxar para atualizar: leitura do ambiente e ocorrências em volta
  const [atualizando, setAtualizando] = useState(false);
  const atualizar = async () => {
    setAtualizando(true);
    try {
      await Promise.all([ambiente.refetch(), ocorrencias.refetch()]);
    } finally {
      setAtualizando(false);
    }
  };

  const abrirMapa = () => router.navigate('/mapa');

  const abrirOcorrencia = (id: number) => {
    setOcorrenciaFoco(id);
    router.navigate('/mapa');
  };

  if (semLocalizacao) return <SemLocalizacao />;

  return (
    <View style={[styles.tela, { backgroundColor: cor.background }]}>
      <ScrollEdge visivel={rolou} />

      <ScrollView
        style={styles.tela}
        contentContainerStyle={{
          paddingTop: insets.top + espaco.sm,
          paddingBottom: ALTURA_TAB_BAR + insets.bottom + espaco.lg,
        }}
        onScroll={(evento) => {
          const rolouAgora = evento.nativeEvent.contentOffset.y > 4;
          if (rolouAgora !== rolou) setRolou(rolouAgora);
        }}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={atualizando}
            onRefresh={() => void atualizar()}
            progressViewOffset={insets.top}
            colors={[cor.textPrimary]}
            progressBackgroundColor={cor.surface}
            tintColor={cor.textPrimary}
          />
        }
      >
        <View style={styles.conteudo}>
          {!estado.online || estado.pendentes > 0 ? (
            <View style={styles.offline}>
              <OfflinePill pendentes={estado.pendentes} online={estado.online} />
            </View>
          ) : null}

          {carregando ? (
            <EsqueletoAgora />
          ) : (
            <>
              <Entrada indice={0}>
                <Cabecalho
                  endereco={nomeEscolhido ?? endereco}
                  cidade={cidade}
                  medidoEm={leitura?.medido_em ?? null}
                  online={estado.online}
                  erro={ambiente.isError}
                  onPress={() => router.navigate('/local')}
                />
              </Entrada>

              {ambiente.isError ? (
                <Entrada indice={1}>
                  <PageError onTentar={tentarTudo} />
                </Entrada>
              ) : (
                <>
                  <Entrada indice={1}>
                    <TempHero leitura={leitura} />
                  </Entrada>

                  <Entrada indice={2}>
                    <TempRange leitura={leitura} />
                  </Entrada>

                  <Entrada indice={3}>
                    <TituloSecao titulo="Perto de você" detalhe={formatarDistancia(raioM)} />
                  </Entrada>

                  <Entrada indice={4}>
                    <RiskSummary
                      ocorrencias={ocorrencias.data ?? []}
                      origem={origem}
                      raioM={raioM}
                      erro={ocorrencias.isError}
                      onTentar={() => void ocorrencias.refetch()}
                      onAbrirMapa={abrirMapa}
                      medido={medido}
                    />
                    <Presenca coords={coordsAmbiente} />
                  </Entrada>

                  <Entrada indice={5}>
                    <View style={styles.duo}>
                      <AqiGauge aqi={leitura?.aqi ?? null} poluente={leitura?.poluente ?? null} />
                      <RainCard chuva3h={leitura?.chuva_3h ?? null} />
                    </View>
                    <InversaoCard leitura={leitura} />
                    <WindCard
                      ventoKmh={leitura?.vento_kmh ?? null}
                      direcao={leitura?.vento_direcao ?? null}
                      rajadaKmh={leitura?.rajada_kmh ?? null}
                      aqi={aqiAtual}
                    />
                  </Entrada>

                  <Entrada indice={6}>
                    <SectionHeader titulo="Próximas horas" />
                  </Entrada>

                  <Entrada indice={7}>
                    <HourlyStrip
                      horas={leitura?.proximas_horas ?? null}
                      agora={leitura?.temperatura ?? null}
                    />
                  </Entrada>

                  <Entrada indice={8}>
                    <OcorrenciasTop
                      ocorrencias={ocorrencias.data ?? []}
                      origem={origem}
                      raioM={raioM}
                      carregando={ocorrencias.isPending}
                      erro={ocorrencias.isError}
                      onTentar={() => void ocorrencias.refetch()}
                      onVerMapa={abrirMapa}
                      onAbrir={abrirOcorrencia}
                      onRelatar={() => setRelatarAberto(true)}
                    />
                  </Entrada>
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  tela: {
    flex: 1,
  },
  conteudo: {
    paddingHorizontal: espaco.gutter,
  },
  offline: {
    marginBottom: espaco.sm,
  },
  tituloSecao: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: espaco.md,
    marginTop: espaco.xl,
    marginBottom: espaco.sm,
    paddingHorizontal: espaco.xs,
  },
  tituloSecaoTexto: {
    fontSize: 15,
    lineHeight: 20,
    flexShrink: 1,
    minWidth: 0,
  },
  duo: {
    flexDirection: 'row',
    gap: espaco.md,
    marginTop: espaco.md,
  },
  esqueleto: {
    gap: espaco.lg,
    paddingTop: espaco.xs,
  },
  esqueletoCabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaco.md,
  },
  esqueletoLocal: {
    flex: 1,
    gap: espaco.sm,
  },
  esqueletoHeroi: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: espaco.md,
    marginTop: espaco.lg,
  },
  esqueletoCondicao: {
    alignItems: 'flex-end',
    gap: espaco.sm,
  },
  esqueletoDuo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
