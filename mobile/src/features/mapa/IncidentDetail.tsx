import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { Pressable, StyleSheet, View } from 'react-native';

import { PageError } from '@/components/PageError';
import { SeverityLabel } from '@/components/SeverityLabel';
import { SeverityMeter } from '@/components/SeverityMeter';
import { Skeleton } from '@/components/Skeleton';
import { T } from '@/components/T';
import { ROTULO_TIPO, type OcorrenciaDetalhe } from '@/domain/tipos';
import type { Coordenada } from '@/features/localizacao';
import { distanciaM, formatarDistancia, rumoGraus } from '@/lib/distancia';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, tamanho } from '@/theme/tokens';

import { ConfirmTimeline } from './ConfirmTimeline';
import { direcaoPorExtenso } from './direcoes';
import { ICONE_TIPO } from './iconesTipo';
import { tempoRelativo } from './tempo';

export type IncidentDetailProps = {
  detalhe: OcorrenciaDetalhe | null;
  carregando: boolean;
  erro: boolean;
  origem: Coordenada;
  endereco: string | null;
  onVoltar: () => void;
  onTentar: () => void;
};

/** Detalhe da ocorrência (modo foco): cabeçalho fixo + corpo rolável. */
export function IncidentDetail({
  detalhe,
  carregando,
  erro,
  origem,
  endereco,
  onVoltar,
  onTentar,
}: IncidentDetailProps) {
  const { cor } = useTema();

  return (
    <>
      <View style={styles.cabecalho}>
        <Pressable
          onPress={onVoltar}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          style={[styles.voltar, { backgroundColor: cor.surfaceMuted }]}
        >
          <Icon name="alt-arrow-left" tamanho={tamanho.icon} cor={cor.textPrimary} />
        </Pressable>
        {detalhe ? (
          <View style={styles.tipo}>
            <Icon name={ICONE_TIPO[detalhe.tipo]} tamanho={18} cor={cor.textSecondary} />
            <T estilo="body" cromo numberOfLines={1} style={styles.tipoTexto}>
              {ROTULO_TIPO[detalhe.tipo]}
            </T>
          </View>
        ) : (
          <View style={styles.tipo}>
            <Skeleton largura={96} altura={16} />
          </View>
        )}
        {detalhe ? (
          <T estilo="caption" cor="textTertiary" numberOfLines={1} style={styles.quando}>
            {tempoRelativo(detalhe.criada_em)}
          </T>
        ) : null}
      </View>

      <BottomSheetScrollView contentContainerStyle={styles.corpo}>
        {carregando || !detalhe ? (
          erro ? (
            <PageError compacta onTentar={onTentar} />
          ) : (
            <SkeletonCorpo />
          )
        ) : (
          <CorpoDetalhe detalhe={detalhe} origem={origem} endereco={endereco} />
        )}
      </BottomSheetScrollView>
    </>
  );
}

function SkeletonCorpo() {
  return (
    <View style={styles.skeleton}>
      <Skeleton largura={200} altura={22} />
      <Skeleton largura="100%" altura={36} />
      <Skeleton largura="80%" altura={20} />
      <Skeleton largura="100%" altura={88} raio={18} />
      <Skeleton largura="90%" altura={16} />
    </View>
  );
}

function CorpoDetalhe({
  detalhe,
  origem,
  endereco,
}: {
  detalhe: OcorrenciaDetalhe;
  origem: Coordenada;
  endereco: string | null;
}) {
  const { cor } = useTema();
  const distancia = distanciaM(
    origem.latitude,
    origem.longitude,
    detalhe.latitude,
    detalhe.longitude,
  );
  const rumo = rumoGraus(origem.latitude, origem.longitude, detalhe.latitude, detalhe.longitude);

  return (
    <>
      <View style={styles.medidor}>
        <SeverityMeter severidade={detalhe.severidade} tamanho="l" />
        <SeverityLabel severidade={detalhe.severidade} estilo="large" />
      </View>

      <View style={styles.dist}>
        <View style={[styles.seta, { borderColor: cor.line }]}>
          <View style={{ transform: [{ rotate: `${rumo}deg` }] }}>
            <Icon name="arrow-up" tamanho={tamanho.icon} cor={cor.textPrimary} />
          </View>
        </View>
        <View style={styles.distTexto}>
          <T estilo="title" numberOfLines={1}>
            {formatarDistancia(distancia)}{' '}
            <T estilo="title" cor="textSecondary">
              {direcaoPorExtenso(rumo)}
            </T>
          </T>
          <T estilo="caption" cor="textSecondary" numberOfLines={2}>
            {endereco ?? '—'}
          </T>
        </View>
      </View>

      <ConfirmTimeline itens={detalhe.linha_do_tempo} severidade={detalhe.severidade} />

      {detalhe.nota ? (
        <T estilo="body" numberOfLines={3} style={styles.nota}>
          “{detalhe.nota}”
        </T>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  tipo: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tipoTexto: {
    flexShrink: 1,
    minWidth: 0,
  },
  quando: {
    flexShrink: 0,
  },
  corpo: {
    paddingHorizontal: espaco.gutter,
    paddingBottom: espaco.lg,
  },
  medidor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 10,
  },
  dist: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  seta: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  distTexto: {
    flex: 1,
    minWidth: 0,
  },
  nota: {
    marginHorizontal: 16,
    marginTop: 16,
    lineHeight: 22,
  },
  skeleton: {
    gap: 12,
    paddingTop: 16,
  },
});
