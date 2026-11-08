/**
 * Alertas em tempo real: WebSocket /v1/ws assinando as células do raio de alerta, regras de
 * filtro (features/alertas/regras.ts), lista persistida, notificação local e atualização do
 * mapa. A reconexão do WebSocket também dispara o envio da fila de relatos (o servidor voltou).
 */
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import Storage from 'expo-sqlite/kv-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { endpoints } from '@/config/endpoints';
import { ROTULO_SEVERIDADE, ROTULO_TIPO, type Severidade } from '@/domain/tipos';
import { acrescentar, avaliar, type ItemAlerta } from '@/features/alertas/regras';
import { avaliarZonas, RAIO_INFLUENCIA_M } from '@/features/alertas/zona';
import { bboxDoRaio } from '@/features/agora/escalas';
import { useOcorrencias } from '@/features/ocorrencias';
import { useLocalizacao } from '@/features/localizacao';
import { celulasNoRaio, decodeBbox, encode } from '@/lib/geohash';
import { formatarDistancia } from '@/lib/distancia';
import { ClienteRealtime, type EstadoConexao } from '@/realtime/cliente';

import { useAjustes } from './ajustes';
import { useRelatos } from './relatos';
import { useUi } from './ui';

const CHAVE = 'alertas.v1';
const CHAVE_ZONAS = 'alertas.zonas.v1';

function lerZonas(): Set<number> {
  try {
    const bruto = Storage.getItemSync(CHAVE_ZONAS);
    return new Set(bruto ? (JSON.parse(bruto) as number[]) : []);
  } catch {
    return new Set();
  }
}

// Canal Android próprio, prioridade alta (banner por cima de outros apps), com duas ações
const CANAL = 'alertas-risco';
const CATEGORIA = 'alerta-risco';
const ACAO_SILENCIAR = 'silenciar-1h';
const CHAVE_SILENCIO = 'alertas.silencioAte.v1';
const SILENCIO_MS = 60 * 60_000;

void (async () => {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CANAL, {
        name: 'Alertas de risco',
        importance: AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 150, 250],
      });
    }
    await Notifications.setNotificationCategoryAsync(CATEGORIA, [
      { identifier: 'ver-no-mapa', buttonTitle: 'Ver no mapa', options: { opensAppToForeground: true } },
      { identifier: ACAO_SILENCIAR, buttonTitle: 'Silenciar 1 h', options: { opensAppToForeground: false } },
    ]);
  } catch {
    // Sem canal/categoria a notificação cai no canal padrão, sem ações
  }
})();

function silenciadoAte(): number {
  try {
    return Number(Storage.getItemSync(CHAVE_SILENCIO)) || 0;
  } catch {
    return 0;
  }
}

function silenciar(): void {
  try {
    Storage.setItemSync(CHAVE_SILENCIO, String(Date.now() + SILENCIO_MS));
  } catch {
    // Sem persistência o silêncio não vale
  }
}

// Notificação aparece mesmo com o app aberto (banner + som)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

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

  // Valores atuais para o callback do WebSocket sem reconectar a cada mudança
  const contexto = useRef({ posicao, raioM, limiar, tiposAtivos, alertas });
  useEffect(() => {
    contexto.current = { posicao, raioM, limiar, tiposAtivos, alertas };
  });

  const cliente = useMemo(() => new ClienteRealtime({ url: endpoints.ws }), []);

  useEffect(() => {
    const semAlerta = cliente.aoAlertar((evento) => {
      // O mapa e o detalhe sempre atualizam, mesmo quando não vira alerta
      void clienteQuery.invalidateQueries({ queryKey: ['ocorrencias'] });
      void clienteQuery.invalidateQueries({ queryKey: ['ocorrencia', evento.ocorrencia.id] });

      const atual = contexto.current;
      const jaAlertada = new Map<number, Severidade>();
      for (const a of [...atual.alertas].reverse()) jaAlertada.set(a.ocorrencia.id, a.ocorrencia.severidade);
      const item = avaliar(evento, { ...atual, jaAlertada }, new Date());
      if (!item) return;
      setAlertas((lista) => {
        const nova = acrescentar(lista, item);
        salvar(nova);
        return nova;
      });
      void notificar(item);
    });
    const semEstado = cliente.aoMudarEstado((estado) => {
      setConexao(estado);
      if (estado === 'conectado') sincronizarAgora();
    });
    cliente.conectar();
    return () => {
      semAlerta();
      semEstado();
      cliente.fechar();
    };
  }, [cliente, clienteQuery, sincronizarAgora]);

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
    return bboxDoRaio(centro, RAIO_INFLUENCIA_M.critico + 1000);
  }, [celulaAtual]);
  const proximas = useOcorrencias(bboxZona, null);
  const dentro = useRef<Set<number>>(lerZonas());

  useEffect(() => {
    if (!posicao || !proximas.data) return;
    const { entrou, dentro: novo } = avaliarZonas(proximas.data, posicao, dentro.current, {
      limiar,
      tiposAtivos,
    });
    dentro.current = novo;
    try {
      Storage.setItemSync(CHAVE_ZONAS, JSON.stringify([...novo]));
    } catch {
      // sem persistência: no pior caso avisa de novo ao reabrir o app
    }
    for (const { ocorrencia, distanciaM } of entrou) {
      const item: ItemAlerta = {
        chave: `zona:${ocorrencia.id}:${Date.now()}`,
        ocorrencia,
        distanciaM,
        recebidoEm: new Date().toISOString(),
        lido: false,
      };
      setAlertas((lista) => {
        const nova = acrescentar(lista, item);
        salvar(nova);
        return nova;
      });
      void notificar(item, true);
    }
  }, [posicao, proximas.data, limiar, tiposAtivos]);

  const marcarLido = useCallback((chave: string) => {
    setAlertas((lista) => {
      const nova = lista.map((a) => (a.chave === chave ? { ...a, lido: true } : a));
      salvar(nova);
      return nova;
    });
  }, []);

  const marcarTodosLidos = useCallback(() => {
    setAlertas((lista) => {
      if (lista.every((a) => a.lido)) return lista;
      const nova = lista.map((a) => (a.lido ? a : { ...a, lido: true }));
      salvar(nova);
      return nova;
    });
  }, []);

  const abrir = useCallback(
    (item: ItemAlerta) => {
      marcarLido(item.chave);
      setOcorrenciaFoco(item.ocorrencia.id);
      router.navigate('/mapa');
    },
    [marcarLido, setOcorrenciaFoco],
  );

  // Toque na notificação abre o detalhe no Mapa
  useEffect(() => {
    const assinatura = Notifications.addNotificationResponseReceivedListener((resposta) => {
      if (resposta.actionIdentifier === ACAO_SILENCIAR) {
        silenciar();
        void Notifications.dismissNotificationAsync(resposta.notification.request.identifier).catch(
          () => undefined,
        );
        return;
      }
      const id = Number(resposta.notification.request.content.data?.ocorrenciaId);
      if (!Number.isFinite(id)) return;
      const item = contexto.current.alertas.find((a) => a.ocorrencia.id === id);
      if (item) abrir(item);
      else {
        setOcorrenciaFoco(id);
        router.navigate('/mapa');
      }
    });
    return () => assinatura.remove();
  }, [abrir, setOcorrenciaFoco]);

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
