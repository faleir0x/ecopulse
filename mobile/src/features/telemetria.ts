/**
 * Telemetria do aparelho como "nó sensor": avisa a API que este celular está por perto.
 * O servidor guarda só a célula geohash6 (~1 km), nunca a coordenada exata. É sinal de
 * presença, então falhas de rede são ignoradas.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { enviarTelemetria } from '@/api/cliente';
import { idAparelho } from '@/data/aparelho';
import { useLocalizacao, type Coordenada, type EstadoLocalizacao } from '@/features/localizacao';
import { distanciaM } from '@/lib/distancia';

/** Reenvio periódico com o app em primeiro plano. */
export const INTERVALO_TELEMETRIA_MS = 5 * 60_000;
/** Andou mais que isto desde o último envio: manda de novo. */
export const DISTANCIA_REENVIO_M = 300;
/** Rajada: no máximo um envio por minuto, mesmo andando rápido. */
export const INTERVALO_MINIMO_ENVIO_MS = 60_000;

type PosicaoReal = { coords: Coordenada; precisaoM: number | null };

type UltimoEnvio = PosicaoReal & { em: number };

/** Só posição real do GPS: bairro escolhido à mão e posição simulada não viram telemetria. */
function posicaoReal(localizacao: EstadoLocalizacao): PosicaoReal | null {
  if (localizacao.status !== 'ok' || localizacao.escolhida || localizacao.simulada) {
    return null;
  }
  return { coords: localizacao.coords, precisaoM: localizacao.precisaoM };
}

/** Mantém a presença do aparelho em dia (usar uma vez, no layout raiz). */
export function useTelemetria(): void {
  const localizacao = useLocalizacao();
  const posicao = useMemo(() => posicaoReal(localizacao), [localizacao]);

  const posicaoRef = useRef<PosicaoReal | null>(posicao);
  const ultimoEnvioRef = useRef<UltimoEnvio | null>(null);
  const ultimaTentativaRef = useRef(0);
  const enviandoRef = useRef(false);
  // No lançamento currentState pode vir null; nesse caso o app está abrindo em primeiro plano.
  const emPrimeiroPlanoRef = useRef(
    AppState.currentState === 'active' || AppState.currentState == null,
  );

  const deveEnviarPorTempo = useCallback((agora: number): boolean => {
    const ultimo = ultimoEnvioRef.current;
    return ultimo === null || agora - ultimo.em >= INTERVALO_TELEMETRIA_MS;
  }, []);

  const deveEnviarPorDistancia = useCallback((atual: PosicaoReal): boolean => {
    const ultimo = ultimoEnvioRef.current;
    if (ultimo === null) return true;
    return (
      distanciaM(
        ultimo.coords.latitude,
        ultimo.coords.longitude,
        atual.coords.latitude,
        atual.coords.longitude,
      ) > DISTANCIA_REENVIO_M
    );
  }, []);

  const tentarEnviar = useCallback(async (agora: number): Promise<void> => {
    const atual = posicaoRef.current;
    if (atual === null || !emPrimeiroPlanoRef.current) return;
    if (enviandoRef.current) return;
    if (agora - ultimaTentativaRef.current < INTERVALO_MINIMO_ENVIO_MS) return;

    enviandoRef.current = true;
    ultimaTentativaRef.current = agora;
    try {
      await enviarTelemetria({
        device_id: idAparelho(),
        latitude: atual.coords.latitude,
        longitude: atual.coords.longitude,
        precisao_m: atual.precisaoM,
        registrado_em: new Date(agora).toISOString(),
      });
      ultimoEnvioRef.current = { ...atual, em: agora };
    } catch {
      // Sinal de presença: sem rede, o próximo ciclo tenta de novo.
    } finally {
      enviandoRef.current = false;
    }
  }, []);

  // Primeira posição e mudanças relevantes (andou mais de DISTANCIA_REENVIO_M)
  useEffect(() => {
    posicaoRef.current = posicao;
    if (posicao !== null && deveEnviarPorDistancia(posicao)) {
      void tentarEnviar(Date.now());
    }
  }, [posicao, deveEnviarPorDistancia, tentarEnviar]);

  // Reenvio periódico enquanto o app está aberto
  useEffect(() => {
    const intervalo = setInterval(() => {
      const agora = Date.now();
      if (deveEnviarPorTempo(agora)) {
        void tentarEnviar(agora);
      }
    }, INTERVALO_TELEMETRIA_MS);

    return () => clearInterval(intervalo);
  }, [deveEnviarPorTempo, tentarEnviar]);

  // Ao voltar ao primeiro plano, envia se o último sinal já está velho
  useEffect(() => {
    const aoMudar = (estado: AppStateStatus) => {
      emPrimeiroPlanoRef.current = estado === 'active';
      const agora = Date.now();
      if (estado === 'active' && deveEnviarPorTempo(agora)) {
        void tentarEnviar(agora);
      }
    };
    const inscricao = AppState.addEventListener('change', aoMudar);
    return () => inscricao.remove();
  }, [deveEnviarPorTempo, tentarEnviar]);
}
