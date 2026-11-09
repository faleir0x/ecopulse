/**
 * Push remoto (FCM, serviço notifier): avisa com o app fechado. Só existe no APK; no Expo Go
 * o Android não entrega push e o app segue só com o WebSocket + notificação local.
 *
 * O aparelho se registra na API com o token FCM, a posição e os ajustes de alerta, e renova
 * quando algo muda (token, ajustes, silêncio, andou DISTANCIA_RENOVAR_M) ou a cada
 * RENOVAR_APOS_MS (o servidor esquece registros sem renovação em 7 dias).
 */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import Storage from 'expo-sqlite/kv-store';
import { Platform } from 'react-native';

import { registrarAparelho, removerAparelho } from '@/api/cliente';
import { idAparelho } from '@/data/aparelho';
import type { Severidade, TipoRisco } from '@/domain/tipos';
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
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient
  );
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
  // TODO(worker)
  throw new Error('não implementado');
}

/** Registro salvo em CHAVE_REGISTRO (null se não houver ou estiver corrompido). */
export function lerRegistro(): RegistroPush | null {
  // TODO(worker)
  throw new Error('não implementado');
}

/** Salva (ou apaga, com null) o registro em CHAVE_REGISTRO; erros de storage são ignorados. */
export function salvarRegistro(registro: RegistroPush | null): void {
  // TODO(worker)
  throw new Error('não implementado');
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
  // TODO(worker)
}

// Usados pela implementação (o worker pode removê-los daqui ao usar de fato)
void Notifications;
void Storage;
void registrarAparelho;
void removerAparelho;
void idAparelho;
void distanciaM;
