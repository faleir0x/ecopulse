import * as Location from 'expo-location';
import { useEffect, useState } from 'react';

export type Coordenada = { latitude: number; longitude: number };
export type EstadoLocalizacao =
  | { status: 'carregando' }
  | { status: 'ok'; coords: Coordenada; precisaoM: number | null; simulada: boolean }
  | { status: 'negada' }
  | { status: 'indisponivel' };

/** "lat,lon" → coordenada; null se ausente ou inválida. */
export function lerSimulada(valor: string | undefined): Coordenada | null {
  if (!valor) return null;
  const [lat, lon] = valor.split(',').map((parte) => Number(parte.trim()));
  if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { latitude: lat, longitude: lon };
}

// Para demonstração e testes: fixa a posição (ex.: Av. Paulista) sem usar o GPS do aparelho
const SIMULADA = lerSimulada(process.env.EXPO_PUBLIC_LOCALIZACAO_SIMULADA);

/** Posição atual em primeiro plano (permissão "enquanto usa o app"), atualizada a cada ~25 m. */
export function useLocalizacao(): EstadoLocalizacao {
  const [estado, setEstado] = useState<EstadoLocalizacao>(
    SIMULADA ? { status: 'ok', coords: SIMULADA, precisaoM: 12, simulada: true } : { status: 'carregando' },
  );

  useEffect(() => {
    if (SIMULADA) {
      // Posição fixa, mas a permissão ainda é pedida: o geocodificador do Android
      // (endereço do detalhe) exige permissão de localização
      void Location.requestForegroundPermissionsAsync();
      return;
    }
    let assinatura: Location.LocationSubscription | null = null;
    let ativo = true;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!ativo) return;
      if (status !== 'granted') {
        setEstado({ status: 'negada' });
        return;
      }
      try {
        assinatura = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 25 },
          (pos) =>
            setEstado({
              status: 'ok',
              coords: { latitude: pos.coords.latitude, longitude: pos.coords.longitude },
              precisaoM: pos.coords.accuracy ?? null,
              simulada: false,
            }),
        );
      } catch {
        if (ativo) setEstado({ status: 'indisponivel' });
      }
    })();

    return () => {
      ativo = false;
      assinatura?.remove();
    };
  }, []);

  return estado;
}
