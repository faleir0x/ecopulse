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

/** "lat,lon;lat,lon;..." → pontos válidos (inválidos são ignorados). */
export function lerTrajeto(valor: string | undefined): Coordenada[] {
  if (!valor) return [];
  return valor
    .split(';')
    .map((parte) => lerSimulada(parte))
    .filter((c): c is Coordenada => c !== null);
}

/** Posição após percorrer `metros` pelo trajeto (vai e volta, para a demo nunca parar). */
export function posicaoNoTrajeto(pontos: Coordenada[], metros: number): Coordenada {
  const primeiro = pontos[0];
  if (!primeiro) throw new Error('trajeto vazio');
  if (pontos.length === 1) return primeiro;
  const ida = [...pontos, ...pontos.slice(0, -1).reverse()];
  const trechos = ida.slice(1).map((p, i) => {
    const a = ida[i]!;
    const dLat = (p.latitude - a.latitude) * 111_320;
    const dLon = (p.longitude - a.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
    return { a, b: p, m: Math.hypot(dLat, dLon) };
  });
  const total = trechos.reduce((soma, t) => soma + t.m, 0) || 1;
  let resto = ((metros % total) + total) % total;
  for (const t of trechos) {
    if (resto <= t.m) {
      const f = t.m === 0 ? 0 : resto / t.m;
      return {
        latitude: t.a.latitude + (t.b.latitude - t.a.latitude) * f,
        longitude: t.a.longitude + (t.b.longitude - t.a.longitude) * f,
      };
    }
    resto -= t.m;
  }
  return primeiro;
}

// Demonstração e testes: posição fixa ("lat,lon", ex.: Av. Paulista) ou um trajeto
// ("lat,lon;lat,lon;...") percorrido sozinho, sem usar o GPS do aparelho
const TRAJETO = lerTrajeto(process.env.EXPO_PUBLIC_LOCALIZACAO_SIMULADA);
const SIMULADA = TRAJETO[0] ?? null;
const VELOCIDADE_SIMULADA_MS = Number(process.env.EXPO_PUBLIC_VELOCIDADE_SIMULADA) || 15;

/** Posição atual em primeiro plano (permissão "enquanto usa o app"), atualizada a cada ~25 m. */
export function useLocalizacao(): EstadoLocalizacao {
  const [estado, setEstado] = useState<EstadoLocalizacao>(
    SIMULADA ? { status: 'ok', coords: SIMULADA, precisaoM: 12, simulada: true } : { status: 'carregando' },
  );

  useEffect(() => {
    if (SIMULADA) {
      // Posição simulada, mas a permissão ainda é pedida: o geocodificador do Android
      // (endereço do detalhe) exige permissão de localização
      void Location.requestForegroundPermissionsAsync();
      if (TRAJETO.length < 2) return;
      const inicio = Date.now();
      const timer = setInterval(() => {
        const metros = ((Date.now() - inicio) / 1000) * VELOCIDADE_SIMULADA_MS;
        setEstado({ status: 'ok', coords: posicaoNoTrajeto(TRAJETO, metros), precisaoM: 12, simulada: true });
      }, 1000);
      return () => clearInterval(timer);
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
