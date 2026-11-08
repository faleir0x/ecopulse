import { Pressable, StyleSheet, View } from 'react-native';

import { ROTULO_SEVERIDADE, SEVERIDADES, type Severidade } from '@/domain/tipos';
import { useTema } from '@/theme/tema';
import { raio } from '@/theme/tokens';

import { SeverityMeter } from './SeverityMeter';
import { T } from './T';

export type ThresholdRulerProps = {
  valor: Severidade;
  onChange: (valor: Severidade) => void;
};

export function ThresholdRuler({ valor, onChange }: ThresholdRulerProps) {
  const { esquema, cor, sev } = useTema();
  const indiceLimiar = SEVERIDADES.indexOf(valor);

  return (
    <View accessibilityRole="tablist" style={styles.linha}>
      {SEVERIDADES.map((nivel, indice) => {
        const ativo = nivel === valor;
        const aceso = indice >= indiceLimiar;
        const corBorda = esquema === 'claro' ? sev.text[nivel] : sev.fill[nivel];

        return (
          <Pressable
            key={nivel}
            onPress={() => onChange(nivel)}
            testID={`limiar-${nivel}`}
            accessibilityRole="button"
            accessibilityLabel={`Avisar a partir de: ${ROTULO_SEVERIDADE[nivel]}`}
            accessibilityState={{ selected: ativo }}
            style={[
              styles.tile,
              { backgroundColor: cor.surfaceMuted },
              ativo && { borderWidth: 2, borderColor: corBorda },
            ]}
          >
            <SeverityMeter severidade={aceso ? nivel : null} tamanho="m" animar={false} />
            <T
              estilo="caption"
              cromo
              numberOfLines={1}
              cor={aceso ? 'textPrimary' : 'textTertiary'}
              style={styles.rotulo}
            >
              {ROTULO_SEVERIDADE[nivel]}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    height: 64,
    borderRadius: raio.chip,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rotulo: {
    fontSize: 12.5,
    lineHeight: 18,
  },
});
