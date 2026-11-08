import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/Card';
import { NoReading } from '@/components/NoReading';
import { T } from '@/components/T';
import { direcaoPorExtenso } from '@/features/mapa/direcoes';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, tamanho } from '@/theme/tokens';

import { VENTO_FRACO_KMH, nivelArMedido } from './escalas';

export type WindCardProps = {
  ventoKmh: number | null;
  /** Graus de onde o vento sopra (0 = norte). */
  direcao: number | null;
  rajadaKmh: number | null;
  aqi: number | null;
};

function inteiro(valor: number): string {
  return String(Math.round(valor));
}

/** Vento a 10 m: velocidade, de onde sopra e rajadas; com ar ruim e vento fraco, avisa. */
export function WindCard({ ventoKmh, direcao, rajadaKmh, aqi }: WindCardProps) {
  const { cor } = useTema();
  const parado = ventoKmh !== null && ventoKmh < VENTO_FRACO_KMH && nivelArMedido(aqi) !== null;

  return (
    <Card estilo={styles.card}>
      <View style={styles.topo}>
        <Icon name="flag-2" tamanho={18} cor={cor.textSecondary} />
        <T estilo="caption" cor="textSecondary" numberOfLines={1}>
          Vento
        </T>
      </View>

      {ventoKmh === null ? (
        <NoReading />
      ) : (
        <>
          <View style={styles.linha}>
            <View
              style={styles.valor}
              accessible
              accessibilityLabel={`${inteiro(ventoKmh)} quilômetros por hora${
                direcao === null ? '' : `, de ${direcaoPorExtenso(direcao)}`
              }`}
            >
              <T estilo="number" tabular numberOfLines={1}>
                {inteiro(ventoKmh)}
              </T>
              <T estilo="caption" cor="textSecondary" numberOfLines={1}>
                km/h
              </T>
            </View>

            {direcao !== null ? (
              <View style={styles.direcao}>
                <View style={[styles.seta, { borderColor: cor.line }]}>
                  {/* A seta aponta para onde o vento vai (direção de origem + 180°) */}
                  <View style={{ transform: [{ rotate: `${(direcao + 180) % 360}deg` }] }}>
                    <Icon name="arrow-up" tamanho={tamanho.iconSm} cor={cor.textPrimary} />
                  </View>
                </View>
                <T estilo="body" cor="textSecondary" numberOfLines={1} style={styles.textoDirecao}>
                  de {direcaoPorExtenso(direcao)}
                </T>
              </View>
            ) : null}

            {rajadaKmh !== null && rajadaKmh > ventoKmh ? (
              <T estilo="caption" cor="textSecondary" tabular numberOfLines={1}>
                Rajadas {inteiro(rajadaKmh)}
              </T>
            ) : null}
          </View>

          {parado ? (
            <T estilo="caption" cor="textSecondary" numberOfLines={2}>
              Vento fraco: a poluição tende a ficar
            </T>
          ) : null}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: espaco.lg,
    gap: 6,
    marginTop: espaco.md,
  },
  topo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    marginTop: 6,
  },
  valor: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  direcao: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
  },
  seta: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textoDirecao: {
    flexShrink: 1,
  },
});
