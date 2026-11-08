import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { EmptyRow } from '@/components/EmptyRow';
import { InlineError } from '@/components/InlineError';
import { SectionHeader } from '@/components/SectionHeader';
import { SeverityLabel } from '@/components/SeverityLabel';
import { SeverityMeter } from '@/components/SeverityMeter';
import { Skeleton } from '@/components/Skeleton';
import { T } from '@/components/T';
import { TypeIcon } from '@/components/TypeIcon';
import { ROTULO_SEVERIDADE, ROTULO_TIPO, type Ocorrencia } from '@/domain/tipos';
import type { Coordenada } from '@/features/localizacao';
import { ocorrenciasNoRaio } from '@/features/mapa/ordenar';
import { tempoRelativo } from '@/features/mapa/tempo';
import { formatarDistancia, distanciaM } from '@/lib/distancia';
import { useTema } from '@/theme/tema';
import { espaco, raio, tamanho } from '@/theme/tokens';

export type OcorrenciasTopProps = {
  ocorrencias: Ocorrencia[];
  origem: Coordenada;
  raioM: number;
  carregando: boolean;
  erro: boolean;
  onTentar: () => void;
  onVerMapa: () => void;
  onAbrir: (id: number) => void;
  onRelatar: () => void;
};

function EsqueletoLinhas() {
  return (
    <View>
      {[0, 1, 2].map((indice) => (
        <View key={indice} style={styles.esqueletoLinha}>
          <Skeleton largura={40} altura={40} raio={raio.tile} />
          <View style={styles.esqueletoMeio}>
            <Skeleton largura="60%" altura={14} />
            <Skeleton largura="40%" altura={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** As 3 ocorrências mais graves do raio (HANDOFF §5.7). */
export function OcorrenciasTop({
  ocorrencias,
  origem,
  raioM,
  carregando,
  erro,
  onTentar,
  onVerMapa,
  onAbrir,
  onRelatar,
}: OcorrenciasTopProps) {
  const { cor } = useTema();
  const lista = useMemo(
    () =>
      ocorrenciasNoRaio(
        ocorrencias.filter((ocorrencia) => ocorrencia.status === 'ativa'),
        origem,
        raioM,
      ).slice(0, 3),
    [ocorrencias, origem, raioM],
  );

  return (
    <View>
      <SectionHeader titulo="Ocorrências" acao={{ rotulo: 'Ver no mapa', onPress: onVerMapa }} />
      <Card estilo={styles.card}>
        {carregando ? (
          <EsqueletoLinhas />
        ) : erro ? (
          <InlineError onTentar={onTentar} />
        ) : lista.length === 0 ? (
          <EmptyRow
            titulo="Nenhum risco por perto"
            acao={{ rotulo: 'Relatar', onPress: onRelatar }}
          />
        ) : (
          lista.map((ocorrencia, indice) => {
            const distancia = distanciaM(
              origem.latitude,
              origem.longitude,
              ocorrencia.latitude,
              ocorrencia.longitude,
            );
            const tempo = tempoRelativo(ocorrencia.criada_em);
            const rotulo = `${ROTULO_TIPO[ocorrencia.tipo]}, ${
              ROTULO_SEVERIDADE[ocorrencia.severidade]
            }, ${formatarDistancia(distancia)}, ${tempo}`;

            return (
              <View key={ocorrencia.id}>
                {indice > 0 ? (
                  <View style={[styles.divisor, { backgroundColor: cor.line }]} />
                ) : null}
                <Pressable
                  onPress={() => onAbrir(ocorrencia.id)}
                  accessibilityRole="button"
                  accessibilityLabel={rotulo}
                  style={({ pressed }) => [styles.linha, pressed && { opacity: 0.7 }]}
                >
                  <View style={[styles.tile, { backgroundColor: cor.surfaceMuted }]}>
                    <TypeIcon tipo={ocorrencia.tipo} tamanho={tamanho.icon} />
                  </View>
                  <View style={styles.meio}>
                    <T estilo="headline" cromo numberOfLines={1} style={styles.titulo}>
                      {ROTULO_TIPO[ocorrencia.tipo]}
                    </T>
                    <T estilo="caption" cor="textSecondary" numberOfLines={1}>
                      {formatarDistancia(distancia)} · {tempo}
                    </T>
                  </View>
                  <View style={styles.fim}>
                    <SeverityMeter severidade={ocorrencia.severidade} tamanho="s" animar={false} />
                    <SeverityLabel severidade={ocorrencia.severidade} estilo="caption" />
                  </View>
                </Pressable>
              </View>
            );
          })
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingVertical: espaco.md,
    paddingHorizontal: espaco.gutter,
    minHeight: 64,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: raio.tile,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  meio: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  titulo: {
    fontSize: 15,
    lineHeight: 20,
  },
  fim: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  divisor: {
    height: StyleSheet.hairlineWidth,
    marginLeft: espaco.gutter + 40 + espaco.md,
  },
  esqueletoLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingVertical: espaco.md,
    paddingHorizontal: espaco.gutter,
    minHeight: 64,
  },
  esqueletoMeio: {
    flex: 1,
    gap: 6,
  },
});
