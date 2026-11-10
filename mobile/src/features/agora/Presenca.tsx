import { useQuery } from '@tanstack/react-query';
import { StyleSheet } from 'react-native';

import { buscarPresenca } from '@/api/cliente';
import { T } from '@/components/T';
import type { Coordenada } from '@/features/localizacao';
import { espaco } from '@/theme/tokens';

export type PresencaProps = {
  coords: Coordenada | null;
};

function arredondar(valor: number): string {
  return valor.toFixed(3);
}

/** Quantas pessoas com o EcoPulse estão por perto (sinal de presença da telemetria). */
export function Presenca({ coords }: PresencaProps) {
  const consulta = useQuery({
    queryKey: [
      'presenca',
      coords ? arredondar(coords.latitude) : null,
      coords ? arredondar(coords.longitude) : null,
    ],
    queryFn: ({ signal }) => buscarPresenca(coords!.latitude, coords!.longitude, { signal }),
    enabled: coords !== null,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const presenca = consulta.data;
  if (consulta.isPending || consulta.isError || !presenca) {
    return null;
  }

  const texto =
    presenca.aparelhos >= 2
      ? `~${presenca.aparelhos} pessoas com o EcoPulse por perto agora`
      : 'Você é o primeiro com o EcoPulse por aqui agora';

  return (
    <T estilo="caption" cor="textTertiary" numberOfLines={1} style={styles.texto}>
      {texto}
    </T>
  );
}

const styles = StyleSheet.create({
  texto: {
    marginTop: espaco.sm,
    paddingHorizontal: espaco.xs,
  },
});
