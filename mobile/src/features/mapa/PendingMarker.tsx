import { StyleSheet, View } from 'react-native';
import { Marker } from 'react-native-maps';

import type { RelatoLocal } from '@/data/outbox';
import { ROTULO_SEVERIDADE, ROTULO_TIPO } from '@/domain/tipos';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { marcador } from '@/theme/tokens';

import { ICONE_TIPO } from './iconesTipo';
import { useRedesenhoInicial } from './useRedesenhoInicial';

export type PendingMarkerProps = {
  relato: RelatoLocal;
};

/** Marcador do relato ainda na fila: fundo `surface`, borda na cor `fill` e ícone `text`. */
export function PendingMarker({ relato }: PendingMarkerProps) {
  const { cor, sev } = useTema();
  const tamanho = marcador.tamanho[relato.severidade];
  const lado = Math.max(marcador.areaToque, tamanho + 5);
  const redesenhar = useRedesenhoInicial();

  return (
    <Marker
      coordinate={{ latitude: relato.latitude, longitude: relato.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={redesenhar}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`${ROTULO_TIPO[relato.tipo]}, ${ROTULO_SEVERIDADE[relato.severidade]}, na fila`}
    >
      <View style={[styles.area, { width: lado, height: lado }]}>
        <View
          style={[
            styles.anel,
            {
              width: tamanho + 5,
              height: tamanho + 5,
              borderRadius: (tamanho + 5) / 2,
              backgroundColor: cor.background,
            },
          ]}
        >
          <View
            style={[
              styles.nucleo,
              {
                width: tamanho,
                height: tamanho,
                borderRadius: tamanho / 2,
                backgroundColor: cor.surface,
                borderColor: sev.fill[relato.severidade],
              },
            ]}
          >
            <Icon
              name={ICONE_TIPO[relato.tipo]}
              tamanho={Math.round(tamanho * marcador.proporcaoIcone)}
              cor={sev.text[relato.severidade]}
            />
          </View>
        </View>
      </View>
    </Marker>
  );
}

const styles = StyleSheet.create({
  area: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  anel: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nucleo: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
});
