import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { T } from '@/components/T';
import { SEVERIDADES } from '@/domain/tipos';
import { gradienteTemperatura } from '@/features/agora/escalas';
import { useTema } from '@/theme/tema';
import { escalaTemperatura, espaco, raio } from '@/theme/tokens';

import type { Camada } from './useCamada';

export type LegendaCamadaProps = {
  camada: Camada;
  carregando: boolean;
  /** °C das pontas da escala do calor (relativa ao que está visível). */
  escala: [number, number] | null;
};

const PRIMEIRA_PARADA = escalaTemperatura.paradas[0]![0];
const ULTIMA_PARADA = escalaTemperatura.paradas[escalaTemperatura.paradas.length - 1]![0];

/** Legenda compacta da camada ativa (temperatura ou AQI). Some com a camada "nenhuma". */
export function LegendaCamada({ camada, carregando, escala }: LegendaCamadaProps) {
  const { cor, sev } = useTema();

  if (camada === 'nenhuma') return null;

  // A superfície usa a paleta inteira entre as pontas da escala visível
  const gradiente = gradienteTemperatura(PRIMEIRA_PARADA, ULTIMA_PARADA);

  return (
    <View style={[styles.pill, { backgroundColor: cor.surfaceMuted }]}>
      {carregando || (camada === 'calor' && !escala) ? (
        <T estilo="caption" cor="textSecondary" numberOfLines={1}>
          Carregando camada…
        </T>
      ) : camada === 'calor' ? (
        <View style={styles.conteudo}>
          <View style={[styles.trilho, { backgroundColor: cor.surfaceStrong }]}>
            <LinearGradient
              colors={gradiente.cores as [string, string, ...string[]]}
              locations={gradiente.posicoes as [number, number, ...number[]]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
          </View>
          <T estilo="caption" cor="textSecondary" tabular numberOfLines={1}>
            {escala ? `${Math.round(escala[0])}° · ${Math.round(escala[1])}°` : ''}
          </T>
        </View>
      ) : (
        <View style={styles.conteudo}>
          <View style={styles.pontos}>
            {SEVERIDADES.map((nivel) => (
              <View
                key={nivel}
                testID={`legenda-ar-${nivel}`}
                style={[styles.ponto, { backgroundColor: sev.fill[nivel] }]}
              />
            ))}
          </View>
          <T estilo="caption" cor="textSecondary" numberOfLines={1}>
            Baixo → Crítico
          </T>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: raio.pill,
    paddingHorizontal: espaco.md,
    paddingVertical: espaco.sm,
  },
  conteudo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
  },
  trilho: {
    width: 72,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  pontos: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ponto: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
