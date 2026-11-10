/**
 * Push remoto (FCM, serviço notifier): avisa com o app fechado. Só existe no APK; no Expo Go
 * o Android não entrega push e o app segue só com o WebSocket + notificação local.
 *
 * O aparelho se registra na API com o token FCM, a posição e os ajustes de alerta, e renova
 * quando algo muda (token, ajustes, silêncio, andou DISTANCIA_RENOVAR_M) ou a cada
 * RENOVAR_APOS_MS (o servidor esquece registros sem renovação em 7 dias).
 */
import { isRunningInExpoGo } from 'expo';
import * as Notifications from 'expo-notifications';
import Storage from 'expo-sqlite/kv-store';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { registrarAparelho, removerAparelho } from '@/api/cliente';
import { idAparelho } from '@/data/aparelho';
import { SEVERIDADES, TIPOS_RISCO, type Severidade, type TipoRisco } from '@/domain/tipos';
import { distanciaM } from '@/lib/distancia';

export const CHAVE_REGISTRO = 'push.registro.v1';
export const DISTANCIA_RENOVAR_M = 500;
export const RENOVAR_APOS_MS = 24 * 3600_000;
/** Reavalia o registro de tempos em tempos (renovação diária com o app aberto). */
export const INTERVALO_VERIFICACAO_MS = 15 * 60_000;

export type DadosRegistro = {
  token: string;
  latitude: number;
  longitude: number;
  raioM: number;
  limiar: Severidade;
  tipos: TipoRisco[];
  /** epoch ms; 0 = sem silêncio */
  silenciadoAte: number;
};

export type RegistroPush = DadosRegistro & { enviadoEm: number };

/** Android fora do Expo Go (APK/dev build). */
export function pushDisponivel(): boolean {
  return (
    Platform.OS === 'android' &&
    // Mesma detecção do expo-notifications: no Expo Go (SDK 53+) as APIs de push lançam erro.
    // Constants.executionEnvironment não identifica o Expo Go neste SDK.
    !isRunningInExpoGo()
  );
}

function mesmoConjuntoDeTipos(a: TipoRisco[], b: TipoRisco[]): boolean {
  if (a.length !== b.length) return false;
  const ordenadoA = [...a].sort();
  const ordenadoB = [...b].sort();
  return ordenadoA.every((tipo, i) => tipo === ordenadoB[i]);
}

function numeroFinito(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

/**
 * true quando não há registro anterior; quando token, raio, limiar, tipos (mesmo conjunto,
 * ordem não importa) ou silenciadoAte mudaram; quando a posição se afastou mais de
 * DISTANCIA_RENOVAR_M; ou quando `agora - anterior.enviadoEm >= RENOVAR_APOS_MS`.
 */
export function deveRenovar(
  anterior: RegistroPush | null,
  atual: DadosRegistro,
  agora: number,
): boolean {
  if (!anterior) return true;

  if (
    anterior.token !== atual.token ||
    anterior.raioM !== atual.raioM ||
    anterior.limiar !== atual.limiar ||
    anterior.silenciadoAte !== atual.silenciadoAte ||
    !mesmoConjuntoDeTipos(anterior.tipos, atual.tipos)
  ) {
    return true;
  }

  const andou = distanciaM(
    anterior.latitude,
    anterior.longitude,
    atual.latitude,
    atual.longitude,
  );
  if (andou > DISTANCIA_RENOVAR_M) return true;

  return agora - anterior.enviadoEm >= RENOVAR_APOS_MS;
}

/** Registro salvo em CHAVE_REGISTRO (null se não houver ou estiver corrompido). */
export function lerRegistro(): RegistroPush | null {
  try {
    const bruto = Storage.getItemSync(CHAVE_REGISTRO);
    if (!bruto) return null;

    const dado = JSON.parse(bruto) as Partial<RegistroPush>;
    if (
      typeof dado.token !== 'string' ||
      !numeroFinito(dado.latitude) ||
      !numeroFinito(dado.longitude) ||
      !numeroFinito(dado.raioM) ||
      !SEVERIDADES.includes(dado.limiar as Severidade) ||
      !Array.isArray(dado.tipos) ||
      !dado.tipos.every((tipo) => TIPOS_RISCO.includes(tipo as TipoRisco)) ||
      !numeroFinito(dado.silenciadoAte) ||
      !numeroFinito(dado.enviadoEm)
    ) {
      return null;
    }

    return {
      token: dado.token,
      latitude: dado.latitude,
      longitude: dado.longitude,
      raioM: dado.raioM,
      limiar: dado.limiar as Severidade,
      tipos: dado.tipos as TipoRisco[],
      silenciadoAte: dado.silenciadoAte,
      enviadoEm: dado.enviadoEm,
    };
  } catch {
    return null;
  }
}

/** Salva (ou apaga, com null) o registro em CHAVE_REGISTRO; erros de storage são ignorados. */
export function salvarRegistro(registro: RegistroPush | null): void {
  try {
    if (registro) {
      Storage.setItemSync(CHAVE_REGISTRO, JSON.stringify(registro));
    } else {
      Storage.removeItemSync(CHAVE_REGISTRO);
    }
  } catch {
    // Sem persistência o registro vale só nesta sessão
  }
}

export type ParametrosPush = {
  posicao: { latitude: number; longitude: number } | null;
  raioM: number;
  limiar: Severidade;
  tiposAtivos: TipoRisco[];
  silenciadoAte: number;
};

/**
 * Mantém o registro do aparelho em dia (usar uma vez, no AlertasProvider). Sem push
 * disponível não faz nada. Ver o brief/README do módulo para o comportamento.
 */
export function usePushRemoto(parametros: ParametrosPush): void {
  const disponivel = pushDisponivel();
  const parametrosRef = useRef(parametros);
  const tokenRef = useRef<string | null>(null);
  const emAndamento = useRef(false);
  const pendente = useRef(false);

  useEffect(() => {
    parametrosRef.current = parametros;
  });

  const sincronizar = useCallback(async () => {
    if (!pushDisponivel()) return;
    if (emAndamento.current) {
      pendente.current = true;
      return;
    }
    emAndamento.current = true;

    const executar = async (): Promise<void> => {
      let permitido = false;
      try {
        permitido = (await Notifications.getPermissionsAsync()).granted;
      } catch {
        return;
      }

      if (!permitido) {
        if (lerRegistro()) {
          try {
            await removerAparelho(idAparelho());
            salvarRegistro(null);
          } catch {
            // Sem rede: mantém o registro para tentar de novo
          }
        }
        return;
      }

      const atual = parametrosRef.current;
      if (!atual.posicao) return;

      let token = tokenRef.current;
      if (!token) {
        try {
          token = String((await Notifications.getDevicePushTokenAsync()).data);
          tokenRef.current = token;
        } catch {
          return;
        }
      }

      const agora = Date.now();
      const dados: DadosRegistro = {
        token,
        latitude: atual.posicao.latitude,
        longitude: atual.posicao.longitude,
        raioM: atual.raioM,
        limiar: atual.limiar,
        tipos: atual.tiposAtivos,
        silenciadoAte: atual.silenciadoAte,
      };

      if (!deveRenovar(lerRegistro(), dados, agora)) return;

      try {
        await registrarAparelho(idAparelho(), {
          token,
          latitude: dados.latitude,
          longitude: dados.longitude,
          raio_m: dados.raioM,
          limiar: dados.limiar,
          tipos: dados.tipos,
          silenciado_ate:
            dados.silenciadoAte > agora ? new Date(dados.silenciadoAte).toISOString() : null,
        });
        salvarRegistro({ ...dados, enviadoEm: agora });
      } catch {
        // A próxima verificação tenta de novo
      }
    };

    try {
      do {
        pendente.current = false;
        await executar();
      } while (pendente.current);
    } finally {
      emAndamento.current = false;
    }
  }, []);

  // Arredonda para não sincronizar a cada metro andado
  const latitude = parametros.posicao
    ? Math.round(parametros.posicao.latitude * 1000) / 1000
    : null;
  const longitude = parametros.posicao
    ? Math.round(parametros.posicao.longitude * 1000) / 1000
    : null;
  const tiposChave = [...parametros.tiposAtivos].sort().join(',');

  useEffect(() => {
    if (!disponivel) return;
    void sincronizar();
  }, [
    disponivel,
    sincronizar,
    latitude,
    longitude,
    parametros.raioM,
    parametros.limiar,
    tiposChave,
    parametros.silenciadoAte,
  ]);

  useEffect(() => {
    if (!disponivel) return;

    const intervalo = setInterval(() => void sincronizar(), INTERVALO_VERIFICACAO_MS);
    const aoVoltar = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') void sincronizar();
    });
    const aoTrocarToken = Notifications.addPushTokenListener((novo) => {
      tokenRef.current = String(novo.data);
      void sincronizar();
    });

    return () => {
      clearInterval(intervalo);
      aoVoltar.remove();
      aoTrocarToken.remove();
    };
  }, [disponivel, sincronizar]);
}
