/**
 * Alertas em tempo real: WebSocket /v1/ws assinando as células do raio de alerta, lista
 * persistida, notificação local e atualização do mapa. A decisão "avisar ou não" fica no motor
 * puro (features/alertas/motor.ts); aqui só se lê/grava o Storage, aplica o estado devolvido e
 * dispara as notificações. A reconexão do WebSocket também reenvia a fila de relatos.
 */
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import Storage from 'expo-sqlite/kv-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { endpoints } from '@/config/endpoints';
import { ROTULO_SEVERIDADE, ROTULO_TIPO } from '@/domain/tipos';
import { RAIO_INFLUENCIA_MAX_M } from '@/domain/zonaInfluencia';
import {
  aoAvaliarZonas,
  aoReceberEvento,
  type EstadoAlertas,
  type Preferencias,
} from '@/features/alertas/motor';
import { ACAO_SILENCIAR, CANAL, CATEGORIA } from '@/features/alertas/notificacoes';
import { respostaNova, type ItemAlerta } from '@/features/alertas/regras';
import { bboxDoRaio } from '@/features/agora/escalas';
import { useOcorrencias } from '@/features/ocorrencias';
import { useLocalizacao } from '@/features/localizacao';
import { usePushRemoto } from '@/features/push';
import { celulasNoRaio, decodeBbox, encode } from '@/lib/geohash';
import { formatarDistancia } from '@/lib/distancia';
import { ClienteRealtime, type EstadoConexao } from '@/realtime/cliente';

import { useAjustes } from './ajustes';
import { useRelatos } from './relatos';
import { useUi } from './ui';

const CHAVE = 'alertas.v1';
const CHAVE_ZONAS = 'alertas.zonas.v1';
const CHAVE_ZONAS_INICIADAS = 'alertas.zonas.iniciadas.v1';
const CHAVE_ULTIMA_RESPOSTA = 'alertas.ultimaResposta.v1';

function lerZonas(): Set<number> {
  try {
    const bruto = Storage.getItemSync(CHAVE_ZONAS);
    return new Set(bruto ? (JSON.parse(bruto) as number[]) : []);
  } catch {
    return new Set();
  }
}

function lerZonasIniciadas(): boolean {
  try {
    return Storage.getItemSync(CHAVE_ZONAS_INICIADAS) != null;
  } catch {
    return false;
  }
}

function salvarZonas(dentro: ReadonlySet<number>): void {
  try {
    Storage.setItemSync(CHAVE_ZONAS, JSON.stringify([...dentro]));
  } catch {
    // sem persistência: no pior caso avisa de novo ao reabrir o app
  }
}

function salvarZonasIniciadas(): void {
  try {
    Storage.setItemSync(CHAVE_ZONAS_INICIADAS, '1');
  } catch {
    // sem persistência: a próxima sessão semeia de novo
  }
}

const CHAVE_SILENCIO = 'alertas.silencioAte.v1';
const SILENCIO_MS = 60 * 60_000;

function lerUltimaResposta(): string | null {
  try {
    return Storage.getItemSync(CHAVE_ULTIMA_RESPOSTA);
  } catch {
    return null;
  }
}

function salvarUltimaResposta(identificador: string): void {
  try {
    Storage.setItemSync(CHAVE_ULTIMA_RESPOSTA, identificador);
  } catch {
    // Sem persistência: no pior caso trata a mesma resposta de novo ao reabrir
  }
}

function silenciadoAte(): number {
  try {
    return Number(Storage.getItemSync(CHAVE_SILENCIO)) || 0;
  } catch {
    return 0;
  }
}

function silenciar(): number {
  const ate = Date.now() + SILENCIO_MS;
  try {
    Storage.setItemSync(CHAVE_SILENCIO, String(ate));
  } catch {
    // Sem persistência o silêncio não vale
  }
  return ate;
}

// Push remoto com o app aberto não repete o alerta local (o WebSocket já avisou)
// — o handler é registrado em features/alertas/notificacoes.ts (configurarNotificacoes).

type Contexto = {
  alertas: ItemAlerta[];
  naoLidos: number;
  conexao: EstadoConexao;
  marcarLido: (chave: string) => void;
  /** "Ler todos": tira o ponto azul de todos os alertas. */
  marcarTodosLidos: () => void;
  /** Marca como lido e abre o detalhe no Mapa. */
  abrir: (item: ItemAlerta) => void;
};

const AlertasContext = createContext<Contexto | null>(null);

function lerLista(): ItemAlerta[] {
  try {
    const bruto = Storage.getItemSync(CHAVE);
    return bruto ? (JSON.parse(bruto) as ItemAlerta[]) : [];
  } catch {
    return [];
  }
}

function salvar(lista: ItemAlerta[]): void {
  try {
    Storage.setItemSync(CHAVE, JSON.stringify(lista));
  } catch {
    // Sem persistência a lista vale só nesta sessão
  }
}

async function notificar(item: ItemAlerta, zona = false): Promise<void> {
  // "Silenciar 1 h": o alerta entra na lista, só não toca
  if (Date.now() < silenciadoAte()) return;
  const o = item.ocorrencia;
  const distancia = formatarDistancia(item.distanciaM);
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: zona ? 'Área de risco' : `${ROTULO_TIPO[o.tipo]} · ${ROTULO_SEVERIDADE[o.severidade]}`,
        body: zona
          ? `${ROTULO_TIPO[o.tipo]} ${ROTULO_SEVERIDADE[o.severidade].toLowerCase()} · ${distancia}`
          : distancia,
        data: { ocorrenciaId: o.id },
        categoryIdentifier: CATEGORIA,
      },
      trigger: Platform.OS === 'android' ? { channelId: CANAL } : null,
    });
  } catch {
    // Sem permissão de notificação o alerta ainda entra na lista
  }
}

export function AlertasProvider({ children }: { children: ReactNode }) {
  const clienteQuery = useQueryClient();
  const { raioM, limiar, tiposAtivos } = useAjustes();
  const { sincronizarAgora } = useRelatos();
  const { setOcorrenciaFoco } = useUi();
  const local = useLocalizacao();
  const posicao = local.status === 'ok' ? local.coords : null;

  const [alertas, setAlertas] = useState<ItemAlerta[]>(lerLista);
  const [conexao, setConexao] = useState<EstadoConexao>('conectando');
  const [silencioAte, setSilencioAte] = useState(silenciadoAte);

  usePushRemoto({ posicao, raioM, limiar, tiposAtivos, silenciadoAte: silencioAte });

  // Espelhos do estado do motor: os callbacks do WebSocket e da zona leem sempre o valor atual.
  const alertasRef = useRef<ItemAlerta[]>(alertas);
  const dentro = useRef<ReadonlySet<number>>(lerZonas());
  const zonasIniciadas = useRef(lerZonasIniciadas());

  // Valores atuais para o callback do WebSocket sem reconectar a cada mudança
  const prefs = useRef<Preferencias>({ posicao, raioM, limiar, tiposAtivos });
  useEffect(() => {
    prefs.current = { posicao, raioM, limiar, tiposAtivos };
  });

  /** Troca a lista em memória e no Storage; o ref evita leituras desatualizadas nos callbacks. */
  const aplicarLista = useCallback((lista: ItemAlerta[]) => {
    alertasRef.current = lista;
    salvar(lista);
    setAlertas(lista);
  }, []);

  /** Aplica o estado devolvido pelo motor, persistindo só o que mudou (como antes). */
  const aplicarEstado = useCallback(
    (novo: EstadoAlertas) => {
      if (novo.alertas !== alertasRef.current) aplicarLista(novo.alertas);
      if (novo.zonas !== dentro.current) {
        dentro.current = novo.zonas;
        salvarZonas(novo.zonas);
      }
      if (novo.zonasIniciadas !== zonasIniciadas.current) {
        zonasIniciadas.current = novo.zonasIniciadas;
        salvarZonasIniciadas();
      }
    },
    [aplicarLista],
  );

  const cliente = useMemo(() => new ClienteRealtime({ url: endpoints.ws }), []);

  useEffect(() => {
    const semAlerta = cliente.aoAlertar((evento) => {
      // O mapa e o detalhe sempre atualizam, mesmo quando não vira alerta
      void clienteQuery.invalidateQueries({ queryKey: ['ocorrencias'] });
      void clienteQuery.invalidateQueries({ queryKey: ['ocorrencia', evento.ocorrencia.id] });

      const resultado = aoReceberEvento(
        { alertas: alertasRef.current, zonas: dentro.current, zonasIniciadas: zonasIniciadas.current },
        evento,
        prefs.current,
        new Date(),
      );
      if (resultado.avisos.length === 0) return;
      aplicarEstado(resultado.estado);
      for (const aviso of resultado.avisos) void notificar(aviso.item);
    });
    const semEstado = cliente.aoMudarEstado((estado) => {
      setConexao(estado);
      if (estado === 'conectado') {
        sincronizarAgora();
        // Eventos perdidos durante a queda: rebusca as ocorrências ao reconectar
        void clienteQuery.invalidateQueries({ queryKey: ['ocorrencias'] });
      }
    });
    cliente.conectar();
    return () => {
      semAlerta();
      semEstado();
      cliente.fechar();
    };
  }, [cliente, clienteQuery, sincronizarAgora, aplicarEstado]);

  // Assina as células que cobrem o raio em volta da posição atual
  const celulas = useMemo(
    () => (posicao ? celulasNoRaio(posicao.latitude, posicao.longitude, raioM).sort().join(',') : ''),
    [posicao, raioM],
  );
  useEffect(() => {
    cliente.assinar(celulas ? celulas.split(',') : []);
  }, [cliente, celulas]);

  // Zona de influência (proposta: avisar quando o usuário ENTRA na zona de um risco).
  // A consulta fica presa à célula geohash6 da posição: andar não refaz a busca a cada segundo.
  const celulaAtual = posicao ? encode(posicao.latitude, posicao.longitude, 6) : null;
  const bboxZona = useMemo(() => {
    if (!celulaAtual) return null;
    const c = decodeBbox(celulaAtual);
    const centro = { latitude: (c.latMin + c.latMax) / 2, longitude: (c.lonMin + c.lonMax) / 2 };
    return bboxDoRaio(centro, RAIO_INFLUENCIA_MAX_M + 1000);
  }, [celulaAtual]);
  const proximas = useOcorrencias(bboxZona, null);

  useEffect(() => {
    if (!posicao || !proximas.data) return;
    const resultado = aoAvaliarZonas(
      { alertas: alertasRef.current, zonas: dentro.current, zonasIniciadas: zonasIniciadas.current },
      proximas.data,
      { posicao, raioM, limiar, tiposAtivos },
      new Date(),
    );
    aplicarEstado(resultado.estado);
    for (const aviso of resultado.avisos) void notificar(aviso.item, true);
  }, [posicao, raioM, proximas.data, limiar, tiposAtivos, aplicarEstado]);

  const marcarLido = useCallback(
    (chave: string) => {
      aplicarLista(alertasRef.current.map((a) => (a.chave === chave ? { ...a, lido: true } : a)));
    },
    [aplicarLista],
  );

  const marcarTodosLidos = useCallback(() => {
    const lista = alertasRef.current;
    if (lista.every((a) => a.lido)) return;
    aplicarLista(lista.map((a) => (a.lido ? a : { ...a, lido: true })));
  }, [aplicarLista]);

  const abrir = useCallback(
    (item: ItemAlerta) => {
      marcarLido(item.chave);
      setOcorrenciaFoco(item.ocorrencia.id);
      router.navigate('/mapa');
    },
    [marcarLido, setOcorrenciaFoco],
  );

  // Toque na notificação abre o detalhe no Mapa
  const tratarResposta = useCallback(
    (resposta: Notifications.NotificationResponse) => {
      const identificador = `${resposta.notification.request.identifier}:${resposta.actionIdentifier}`;
      if (!respostaNova(identificador, lerUltimaResposta())) return;
      salvarUltimaResposta(identificador);

      if (resposta.actionIdentifier === ACAO_SILENCIAR) {
        setSilencioAte(silenciar());
        void Notifications.dismissNotificationAsync(resposta.notification.request.identifier).catch(
          () => undefined,
        );
        return;
      }
      const id = Number(resposta.notification.request.content.data?.ocorrenciaId);
      if (!Number.isFinite(id)) return;
      const item = alertasRef.current.find((a) => a.ocorrencia.id === id);
      if (item) abrir(item);
      else {
        setOcorrenciaFoco(id);
        router.navigate('/mapa');
      }
    },
    [abrir, setOcorrenciaFoco],
  );

  useEffect(() => {
    const assinatura = Notifications.addNotificationResponseReceivedListener(tratarResposta);
    // Resposta que abriu o app com ele fechado não passa pelo listener: busca uma vez ao montar
    void Notifications.getLastNotificationResponseAsync()
      .then((resposta) => {
        if (resposta) tratarResposta(resposta);
      })
      .catch(() => undefined);
    return () => assinatura.remove();
  }, [tratarResposta]);

  const naoLidos = alertas.filter((a) => !a.lido).length;
  const valor = useMemo(
    () => ({ alertas, naoLidos, conexao, marcarLido, marcarTodosLidos, abrir }),
    [alertas, naoLidos, conexao, marcarLido, marcarTodosLidos, abrir],
  );
  return <AlertasContext.Provider value={valor}>{children}</AlertasContext.Provider>;
}

export function useAlertas(): Contexto {
  const valor = useContext(AlertasContext);
  if (!valor) throw new Error('useAlertas fora do AlertasProvider');
  return valor;
}
