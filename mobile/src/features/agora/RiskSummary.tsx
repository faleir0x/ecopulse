import { useMemo } from 'react';
import { PixelRatio, Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { InlineError } from '@/components/InlineError';
import { SeverityMeter } from '@/components/SeverityMeter';
import { T } from '@/components/T';
import { TypeIcon } from '@/components/TypeIcon';
import {
  ROTULO_SEVERIDADE,
  ROTULO_TIPO,
  SEVERIDADES,
  TIPOS_RISCO,
  type Ocorrencia,
  type Severidade,
  type TipoRisco,
} from '@/domain/tipos';
import type { Coordenada } from '@/features/localizacao';
import { ocorrenciasNoRaio } from '@/features/mapa/ordenar';
import { useTema } from '@/theme/tema';
import { espaco, tamanho } from '@/theme/tokens';

export type RiskSummaryProps = {
  ocorrencias: Ocorrencia[];
  origem: Coordenada;
  raioM: number;
  erro: boolean;
  onTentar: () => void;
  onAbrirMapa: () => void;
  /** Níveis medidos (ar, calor): a célula mostra o pior entre o relatado e o medido. */
  medido?: Partial<Record<TipoRisco, Severidade | null>>;
};

function vazioPorTipo(): Record<TipoRisco, Severidade | null> {
  return Object.fromEntries(TIPOS_RISCO.map((tipo) => [tipo, null])) as Record<
    TipoRisco,
    Severidade | null
  >;
}

/** Pior nível ativo de cada tipo dentro do raio. */
export function piorPorTipo(
  ocorrencias: Ocorrencia[],
  origem: Coordenada,
  raioM: number,
): Record<TipoRisco, Severidade | null> {
  const resultado = vazioPorTipo();
  const ativas = ocorrencias.filter((ocorrencia) => ocorrencia.status === 'ativa');
  for (const ocorrencia of ocorrenciasNoRaio(ativas, origem, raioM)) {
    const atual = resultado[ocorrencia.tipo];
    if (atual === null || SEVERIDADES.indexOf(ocorrencia.severidade) > SEVERIDADES.indexOf(atual)) {
      resultado[ocorrencia.tipo] = ocorrencia.severidade;
    }
  }
  return resultado;
}

/** "Perto de você": os 4 tipos em 2×2 (ou 4 linhas com fonte grande). */
export function RiskSummary({
  ocorrencias,
  origem,
  raioM,
  erro,
  onTentar,
  onAbrirMapa,
  medido,
}: RiskSummaryProps) {
  const { cor, sev } = useTema();
  const piores = useMemo(() => {
    const relatados = piorPorTipo(ocorrencias, origem, raioM);
    for (const tipo of TIPOS_RISCO) {
      const valor = medido?.[tipo] ?? null;
      const atual = relatados[tipo];
      if (valor && (atual === null || SEVERIDADES.indexOf(valor) > SEVERIDADES.indexOf(atual))) {
        relatados[tipo] = valor;
      }
    }
    return relatados;
  }, [ocorrencias, origem, raioM, medido]);
  const emLinhas = PixelRatio.getFontScale() > 1.15;

  if (erro) {
    return (
      <Card estilo={styles.card}>
        <InlineError onTentar={onTentar} />
      </Card>
    );
  }

  return (
    <Card estilo={styles.card}>
      <View style={emLinhas ? styles.coluna : styles.grade}>
        {TIPOS_RISCO.map((tipo, indice) => {
          const pior = piores[tipo];
          const rotulo = pior ? ROTULO_SEVERIDADE[pior] : 'Sem risco';
          return (
            <Pressable
              key={tipo}
              onPress={onAbrirMapa}
              accessibilityRole="button"
              accessibilityLabel={`${ROTULO_TIPO[tipo]}: ${rotulo}`}
              style={({ pressed }) => [
                styles.celula,
                emLinhas ? styles.celulaLinha : styles.celulaGrade,
                !emLinhas && indice % 2 === 1
                  ? { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: cor.line }
                  : null,
                !emLinhas && indice >= 2
                  ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cor.line }
                  : null,
                emLinhas && indice > 0
                  ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: cor.line }
                  : null,
                pressed && { opacity: 0.7 },
              ]}
            >
              <View style={emLinhas ? styles.topoLinha : styles.topoGrade}>
                <TypeIcon tipo={tipo} tamanho={tamanho.icon} />
                <SeverityMeter severidade={pior} tamanho="m" animar={false} />
              </View>
              <T
                estilo="caption"
                cor="textSecondary"
                numberOfLines={1}
                style={emLinhas ? styles.nomeLinha : styles.nome}
              >
                {ROTULO_TIPO[tipo]}
              </T>
              <T
                estilo="body"
                corHex={pior ? sev.text[pior] : cor.textTertiary}
                numberOfLines={1}
                style={styles.nivel}
              >
                {rotulo}
              </T>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  grade: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  coluna: {
    flexDirection: 'column',
  },
  celula: {
    justifyContent: 'center',
    minHeight: 92,
    paddingVertical: 14,
    paddingHorizontal: espaco.md,
  },
  celulaGrade: {
    width: '50%',
  },
  celulaLinha: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    paddingHorizontal: espaco.gutter,
    minHeight: 64,
  },
  topoGrade: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaco.sm,
    marginBottom: 6,
  },
  topoLinha: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: espaco.sm,
    flexShrink: 0,
  },
  nome: {
    flexShrink: 1,
    minWidth: 0,
  },
  nomeLinha: {
    flex: 1,
    minWidth: 0,
  },
  nivel: {
    fontWeight: '600',
    flexShrink: 1,
    minWidth: 0,
  },
});
