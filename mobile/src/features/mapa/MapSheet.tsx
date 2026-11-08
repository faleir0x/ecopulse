import BottomSheet, { BottomSheetFooter, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import type { BottomSheetBackgroundProps, BottomSheetFooterProps } from '@gorhom/bottom-sheet';
import type { ComponentRef, ReactNode, RefObject } from 'react';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyRow, PageError, Skeleton, T } from '@/components';
import { ALTURA_TAB_BAR } from '@/components/TabBar';
import type { Ocorrencia, OcorrenciaDetalhe } from '@/domain/tipos';
import type { Coordenada } from '@/features/localizacao';
import { distanciaM, formatarDistancia } from '@/lib/distancia';
import { useTema } from '@/theme/tema';
import { espaco, raio, sheet as tokensSheet } from '@/theme/tokens';

import { DetailFooter, type EstadoResposta } from './DetailFooter';
import { IncidentDetail } from './IncidentDetail';
import { IncidentRow } from './IncidentRow';
import { tempoRelativo } from './tempo';

export type RefSheet = ComponentRef<typeof BottomSheet>;

export type MapSheetProps = {
  sheetRef: RefObject<RefSheet | null>;
  posicao: SharedValue<number>;
  onChange: (indice: number) => void;

  modoFoco: boolean;

  // lista
  lista: Ocorrencia[];
  origem: Coordenada;
  raioM: number;
  carregando: boolean;
  erro: boolean;
  temFiltro: boolean;
  onTentar: () => void;
  onLimparFiltro: () => void;
  onAbrir: (id: number) => void;

  // detalhe
  detalhe: OcorrenciaDetalhe | null;
  detalheCarregando: boolean;
  detalheErro: boolean;
  endereco: string | null;
  onVoltar: () => void;
  onTentarDetalhe: () => void;

  // rodapé
  estadoResposta: EstadoResposta;
  onConfirmar: () => void;
  onResolvido: () => void;
  onDesfazer?: () => void;

  /** Modo rota: substitui lista e detalhe (snaps peek/half). */
  rota?: { conteudo: ReactNode; rodape: ReactNode | null } | null;
};

function AlcaSheet() {
  const { cor } = useTema();
  return (
    <View style={styles.alca}>
      <View style={[styles.alcaBarra, { backgroundColor: cor.surfaceStrong }]} />
    </View>
  );
}

function FundoSheet({ style }: BottomSheetBackgroundProps) {
  const { cor } = useTema();
  return (
    <View
      style={[
        style,
        {
          backgroundColor: cor.surface,
          borderTopLeftRadius: raio.sheet,
          borderTopRightRadius: raio.sheet,
        },
      ]}
    />
  );
}

function SkeletonLista() {
  return (
    <View style={styles.skeletonLista}>
      {[0, 1, 2].map((indice) => (
        <View key={indice} style={styles.skeletonLinha}>
          <Skeleton largura={40} altura={40} raio={raio.tile} />
          <View style={styles.skeletonMeio}>
            <Skeleton largura="60%" altura={14} />
            <Skeleton largura="40%" altura={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function MapSheet(props: MapSheetProps) {
  const {
    sheetRef,
    posicao,
    onChange,
    modoFoco,
    lista,
    origem,
    raioM,
    carregando,
    erro,
    temFiltro,
    onTentar,
    onLimparFiltro,
    onAbrir,
    detalhe,
    detalheCarregando,
    detalheErro,
    endereco,
    onVoltar,
    onTentarDetalhe,
    estadoResposta,
    onConfirmar,
    onResolvido,
    onDesfazer,
    rota,
  } = props;

  const { cor } = useTema();
  const insets = useSafeAreaInsets();

  const snaps = rota
    ? [tokensSheet.peek, tokensSheet.half]
    : modoFoco
    ? [tokensSheet.peek, tokensSheet.detail, tokensSheet.full]
    : [tokensSheet.peek, tokensSheet.half, tokensSheet.full];

  const footer = useCallback(
    (footerProps: BottomSheetFooterProps) => {
      const conteudoRodape = rota
        ? rota.rodape
        : modoFoco && detalhe
          ? (
              <DetailFooter
                estado={estadoResposta}
                onConfirmar={onConfirmar}
                onResolvido={onResolvido}
                onDesfazer={onDesfazer}
              />
            )
          : null;
      if (!conteudoRodape) return null;
      // BottomSheetFooter acompanha a borda inferior visível da sheet durante o arraste
      return (
        <BottomSheetFooter {...footerProps}>
          <View
            style={[
              styles.footer,
              { backgroundColor: cor.surface, paddingBottom: espaco.lg + insets.bottom },
            ]}
          >
            {conteudoRodape}
          </View>
        </BottomSheetFooter>
      );
    },
    [rota, modoFoco, detalhe, estadoResposta, onConfirmar, onResolvido, onDesfazer, cor.surface, insets.bottom],
  );

  const conteudoLista = (
    <>
      <View style={styles.tituloLista}>
        <T estilo="title" numberOfLines={1}>
          {lista.length === 0
            ? 'Nenhuma ocorrência'
            : lista.length === 1
              ? '1 ocorrência'
              : `${lista.length} ocorrências`}
        </T>
        <T estilo="caption" cor="textTertiary" numberOfLines={1}>
          em {formatarDistancia(raioM)}
        </T>
      </View>
      <BottomSheetScrollView
        contentContainerStyle={{ paddingBottom: ALTURA_TAB_BAR + insets.bottom + espaco.lg }}
      >
        {carregando ? (
          <SkeletonLista />
        ) : erro ? (
          <View style={styles.erroLista}>
            <PageError compacta onTentar={onTentar} />
          </View>
        ) : lista.length === 0 ? (
          <EmptyRow
            titulo="Nenhum risco por perto"
            acao={temFiltro ? { rotulo: 'Mostrar tudo', onPress: onLimparFiltro } : undefined}
          />
        ) : (
          <View>
            {lista.map((ocorrencia, indice) => (
              <View key={ocorrencia.id}>
                {indice > 0 ? <View style={[styles.divisor, { backgroundColor: cor.line }]} /> : null}
                <IncidentRow
                  ocorrencia={ocorrencia}
                  distanciaM={distanciaM(
                    origem.latitude,
                    origem.longitude,
                    ocorrencia.latitude,
                    ocorrencia.longitude,
                  )}
                  tempo={tempoRelativo(ocorrencia.criada_em)}
                  onPress={() => onAbrir(ocorrencia.id)}
                />
              </View>
            ))}
          </View>
        )}
      </BottomSheetScrollView>
    </>
  );

  const conteudoDetalhe = (
    <IncidentDetail
      detalhe={detalhe}
      carregando={detalheCarregando}
      erro={detalheErro}
      origem={origem}
      endereco={endereco}
      onVoltar={onVoltar}
      onTentar={onTentarDetalhe}
    />
  );

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      snapPoints={snaps}
      animatedPosition={posicao}
      onChange={(indice) => onChange(indice)}
      topInset={insets.top}
      enableDynamicSizing={false}
      handleComponent={AlcaSheet}
      backgroundComponent={FundoSheet}
      footerComponent={footer}
    >
      {rota ? rota.conteudo : modoFoco ? conteudoDetalhe : conteudoLista}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  erroLista: {
    paddingHorizontal: espaco.gutter,
  },
  alca: {
    paddingTop: 8,
    paddingBottom: 6,
    alignItems: 'center',
  },
  alcaBarra: {
    width: 38,
    height: 5,
    borderRadius: 3,
  },
  tituloLista: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: espaco.gutter,
    paddingBottom: 6,
  },
  divisor: {
    height: StyleSheet.hairlineWidth,
    marginLeft: espaco.gutter + 40 + espaco.md,
  },
  skeletonLista: {
    gap: espaco.sm,
    paddingHorizontal: espaco.gutter,
  },
  skeletonLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingVertical: espaco.sm,
  },
  skeletonMeio: {
    flex: 1,
    gap: 8,
  },
  footer: {
    paddingHorizontal: espaco.gutter,
    paddingTop: espaco.md,
    paddingBottom: espaco.lg,
  },});
