import * as Location from 'expo-location';
import Storage from 'expo-sqlite/kv-store';
import * as Linking from 'expo-linking';
import { useEffect, useMemo, useState } from 'react';

export type Coordenada = { latitude: number; longitude: number };
export type LocalEscolhido = { latitude: number; longitude: number; nome: string };
export type EstadoLocalizacao =
  | { status: 'carregando' }
  | {
      status: 'ok';
      coords: Coordenada;
      precisaoM: number | null;
      simulada: boolean;
      escolhida?: boolean;
      nome?: string;
    }
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

// Local escolhido à mão (bairro/endereço), usado quando o GPS não está disponível.
// Fica no módulo para Agora, Mapa, alertas e rota lerem o mesmo ponto.
const CHAVE_ESCOLHIDO = 'localizacao.escolhido.v1';
const ouvintesEscolhido = new Set<() => void>();
let escolhido: LocalEscolhido | null = null;

function lerEscolhido(): LocalEscolhido | null {
  try {
    const bruto = Storage.getItemSync(CHAVE_ESCOLHIDO);
    if (!bruto) return null;
    const dado = JSON.parse(bruto) as Partial<LocalEscolhido>;
    if (
      typeof dado.latitude !== 'number' ||
      !Number.isFinite(dado.latitude) ||
      typeof dado.longitude !== 'number' ||
      !Number.isFinite(dado.longitude) ||
      typeof dado.nome !== 'string'
    ) {
      return null;
    }
    return { latitude: dado.latitude, longitude: dado.longitude, nome: dado.nome };
  } catch {
    return null;
  }
}

escolhido = lerEscolhido();

/** Escolhe um ponto (bairro/endereço) ou volta ao GPS (null). Persiste e avisa os ouvintes. */
export function escolherLocal(local: LocalEscolhido | null): void {
  escolhido = local;
  try {
    if (local) Storage.setItemSync(CHAVE_ESCOLHIDO, JSON.stringify(local));
    else Storage.removeItemSync(CHAVE_ESCOLHIDO);
  } catch {
    // Sem persistência o escolhido vale só nesta sessão
  }
  ouvintesEscolhido.forEach((ouvinte) => ouvinte());
}

/** Local escolhido atual; reage a `escolherLocal` sem reiniciar o app. */
export function useLocalEscolhido(): LocalEscolhido | null {
  const [, atualizar] = useState(0);

  useEffect(() => {
    const ouvinte = () => atualizar((valor) => valor + 1);
    ouvintesEscolhido.add(ouvinte);
    return () => {
      ouvintesEscolhido.delete(ouvinte);
    };
  }, []);

  return escolhido;
}

// Última posição real (GPS ou simulada) para orientar a busca de bairro quando o GPS sumir
const CHAVE_ULTIMA = 'localizacao.ultima.v1';

/** Última posição conhecida do aparelho (persistida), ou null. */
export function ultimaPosicaoConhecida(): Coordenada | null {
  try {
    const bruto = Storage.getItemSync(CHAVE_ULTIMA);
    return bruto ? lerSimulada(bruto) : null;
  } catch {
    return null;
  }
}

function guardarUltima(coords: Coordenada): void {
  try {
    Storage.setItemSync(CHAVE_ULTIMA, `${coords.latitude.toFixed(4)},${coords.longitude.toFixed(4)}`);
  } catch {
    // Sem persistência a busca só perde a referência
  }
}

const ouvintesPermissao = new Set<() => void>();

/** Pede a permissão; sem chance de perguntar de novo, abre os Ajustes do aparelho. */
export async function pedirPermissao(): Promise<boolean> {
  try {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted' && !canAskAgain) {
      await Linking.openSettings();
    }
    ouvintesPermissao.forEach((ouvinte) => ouvinte());
    return status === 'granted';
  } catch {
    ouvintesPermissao.forEach((ouvinte) => ouvinte());
    return false;
  }
}

function trechosDe(pontos: Coordenada[]) {
  return pontos.slice(1).map((p, i) => {
    const a = pontos[i]!;
    const dLat = (p.latitude - a.latitude) * 111_320;
    const dLon = (p.longitude - a.longitude) * 111_320 * Math.cos((a.latitude * Math.PI) / 180);
    return { a, b: p, m: Math.hypot(dLat, dLon) };
  });
}

/** Posição após percorrer `metros` pelo trajeto (vai e volta, para a demo nunca parar). */
export function posicaoNoTrajeto(pontos: Coordenada[], metros: number): Coordenada {
  const primeiro = pontos[0];
  if (!primeiro) throw new Error('trajeto vazio');
  if (pontos.length === 1) return primeiro;
  const ida = [...pontos, ...pontos.slice(0, -1).reverse()];
  const total = trechosDe(ida).reduce((soma, t) => soma + t.m, 0) || 1;
  return posicaoNaLinha(ida, ((metros % total) + total) % total);
}

/** Posição após percorrer `metros` pela linha, só de ida: depois do fim fica no último ponto. */
export function posicaoNaLinha(pontos: Coordenada[], metros: number): Coordenada {
  const primeiro = pontos[0];
  if (!primeiro) throw new Error('linha vazia');
  let resto = Math.max(0, metros);
  for (const t of trechosDe(pontos)) {
    if (resto <= t.m) {
      const f = t.m === 0 ? 0 : resto / t.m;
      return {
        latitude: t.a.latitude + (t.b.latitude - t.a.latitude) * f,
        longitude: t.a.longitude + (t.b.longitude - t.a.longitude) * f,
      };
    }
    resto -= t.m;
  }
  return pontos[pontos.length - 1]!;
}

// Demonstração e testes: posição fixa ("lat,lon", ex.: Av. Paulista) ou um trajeto
// ("lat,lon;lat,lon;...") percorrido sozinho, sem usar o GPS do aparelho
const TRAJETO = lerTrajeto(process.env.EXPO_PUBLIC_LOCALIZACAO_SIMULADA);
const SIMULADA = TRAJETO[0] ?? null;
const VELOCIDADE_SIMULADA_MS = Number(process.env.EXPO_PUBLIC_VELOCIDADE_SIMULADA) || 15;

/** Há posição simulada (então dá para "andar" pela rota na demonstração). */
export const LOCALIZACAO_SIMULADA = SIMULADA !== null;

// Percurso da demonstração (ex.: a rota segura): a posição simulada anda por ele e para no fim.
// Fica no módulo porque Mapa, Agora, alertas e relato leem a mesma posição.
let percurso: { pontos: Coordenada[]; inicio: number } | null = null;
let posicaoAtual: Coordenada | null = SIMULADA;
const ouvintes = new Set<() => void>();

/** Liga (pontos) ou desliga (null) o percurso simulado. Sem posição simulada, não faz nada. */
export function simularPercurso(pontos: Coordenada[] | null): void {
  if (!SIMULADA) return;
  percurso = pontos && pontos.length >= 2 ? { pontos, inicio: Date.now() } : null;
  ouvintes.forEach((ouvinte) => ouvinte());
}

function posicaoSimulada(inicioTrajeto: number): Coordenada | null {
  if (percurso) {
    const metros = ((Date.now() - percurso.inicio) / 1000) * VELOCIDADE_SIMULADA_MS;
    posicaoAtual = posicaoNaLinha(percurso.pontos, metros);
  } else if (TRAJETO.length >= 2) {
    const metros = ((Date.now() - inicioTrajeto) / 1000) * VELOCIDADE_SIMULADA_MS;
    posicaoAtual = posicaoNoTrajeto(TRAJETO, metros);
  }
  // Sem percurso nem trajeto: fica onde parou (fim da última rota ou o ponto fixo)
  return posicaoAtual;
}

/** Posição atual em primeiro plano (permissão "enquanto usa o app"), atualizada a cada ~25 m. */
export function useLocalizacao(): EstadoLocalizacao {
  const escolhidoAtual = useLocalEscolhido();
  const [estado, setEstado] = useState<EstadoLocalizacao>(
    SIMULADA ? { status: 'ok', coords: SIMULADA, precisaoM: 12, simulada: true } : { status: 'carregando' },
  );
  const [versaoPermissao, setVersaoPermissao] = useState(0);

  // `pedirPermissao` avisa aqui: o efeito do GPS roda de novo e passa a observar a posição
  // sem precisar reiniciar o app
  useEffect(() => {
    const ouvinte = () => setVersaoPermissao((valor) => valor + 1);
    ouvintesPermissao.add(ouvinte);
    return () => {
      ouvintesPermissao.delete(ouvinte);
    };
  }, []);

  useEffect(() => {
    if (SIMULADA) {
      // Posição simulada, mas a permissão ainda é pedida: o geocodificador do Android
      // (endereço do detalhe) exige permissão de localização
      void Location.requestForegroundPermissionsAsync();
      const inicio = Date.now();
      const atualizar = () => {
        const coords = posicaoSimulada(inicio);
        if (!coords) return;
        setEstado((atual) =>
          atual.status === 'ok' &&
          atual.coords.latitude === coords.latitude &&
          atual.coords.longitude === coords.longitude
            ? atual
            : { status: 'ok', coords, precisaoM: 12, simulada: true },
        );
      };
      atualizar();
      ouvintes.add(atualizar);
      const timer = setInterval(atualizar, 1000);
      return () => {
        clearInterval(timer);
        ouvintes.delete(atualizar);
      };
    }
  }, []);

  // Guarda a posição real (não o bairro escolhido) para a busca de local usar depois
  const ultimaReal = estado.status === 'ok' ? estado.coords : null;
  useEffect(() => {
    if (ultimaReal) guardarUltima(ultimaReal);
  }, [ultimaReal]);

  useEffect(() => {
    if (SIMULADA) return;
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
  }, [versaoPermissao]);

  // O local escolhido à mão vale até o usuário voltar para "Minha localização" (mesmo com GPS)
  // Mesmo objeto enquanto o escolhido não muda: quem depende de coords não recalcula à toa
  const estadoEscolhido = useMemo<EstadoLocalizacao | null>(
    () =>
      escolhidoAtual
        ? {
            status: 'ok',
            coords: { latitude: escolhidoAtual.latitude, longitude: escolhidoAtual.longitude },
            precisaoM: null,
            simulada: false,
            escolhida: true,
            nome: escolhidoAtual.nome,
          }
        : null,
    [escolhidoAtual],
  );
  if (estadoEscolhido) return estadoEscolhido;
  return estado;
}
