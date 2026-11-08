import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

import type { Coordenada } from '@/features/localizacao';

function montarEndereco(resultado: Location.LocationGeocodedAddress): string {
  const primeira =
    resultado.street && resultado.streetNumber
      ? `${resultado.street}, ${resultado.streetNumber}`
      : (resultado.street ?? resultado.name);
  const partes = [primeira, resultado.district, resultado.city].filter(
    (parte): parte is string => typeof parte === 'string' && parte.length > 0,
  );
  return partes.slice(0, 2).join(', ');
}

/** Só o bairro (cabeçalho da Agora); cai para a rua ou a cidade se o geocodificador não tiver. */
function montarBairro(resultado: Location.LocationGeocodedAddress): string | null {
  return resultado.district ?? resultado.street ?? resultado.city ?? null;
}

type Resultado = { latitude: number; longitude: number; endereco: string | null };

/** Endereço por geocodificação reversa; null enquanto carrega, se falhar ou sem coordenada. */
export function useEndereco(
  coordenada: Coordenada | null,
  formato: 'completo' | 'bairro' | 'cidade' = 'completo',
): string | null {
  const latitude = coordenada?.latitude ?? null;
  const longitude = coordenada?.longitude ?? null;
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    if (latitude === null || longitude === null) return;
    let ativo = true;
    (async () => {
      try {
        const lista = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (!ativo) return;
        const primeiro = lista[0];
        setResultado({
          latitude,
          longitude,
          endereco: primeiro
            ? formato === 'bairro'
              ? montarBairro(primeiro)
              : formato === 'cidade'
                ? (primeiro.city ?? primeiro.subregion ?? null)
                : montarEndereco(primeiro)
            : null,
        });
      } catch {
        if (ativo) setResultado({ latitude, longitude, endereco: null });
      }
    })();
    return () => {
      ativo = false;
    };
  }, [latitude, longitude, formato]);

  if (latitude === null || longitude === null) return null;
  if (!resultado || resultado.latitude !== latitude || resultado.longitude !== longitude) return null;
  return resultado.endereco;
}
