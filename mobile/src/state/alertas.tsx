/**
 * Alertas em tempo real: WebSocket /v1/ws assinando as células do raio de alerta, regras de
 * filtro (features/alertas/regras.ts), lista persistida, notificação local e atualização do
 * mapa. A reconexão do WebSocket também dispara o envio da fila de relatos (o servidor voltou).
 */
import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import Storage from 'expo-sqlite/kv-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { endpoints } from '@/config/endpoints';
import { ROTULO_SEVERIDADE, ROTULO_TIPO, type Severidade } from '@/domain/tipos';
import { acrescentar, avaliar, type ItemAlerta } from '@/features/alertas/regras';
import { useLocalizacao } from '@/features/localizacao';
import { celulasNoRaio } from '@/lib/geohash';
import { formatarDistancia } from '@/lib/distancia';
import { ClienteRealtime, type EstadoConexao } from '@/realtime/cliente';

import { useAjustes } from './ajustes';
import { useRelatos } from './relatos';
import { useUi } from './ui';

const CHAVE = 'alertas.v1';

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

async function notificar(item: ItemAlerta): Promise<void> {
  const o = item.ocorrencia;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${ROTULO_TIPO[o.tipo]} · ${ROTULO_SEVERIDADE[o.severidade]}`,
        body: `A ${formatarDistancia(item.distanciaM)} de você`,
        data: { ocorrenciaId: o.id },
      },
      trigger: null,
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

  const marcarLido = useCallback((chave: string) => {
    setAlertas((lista) => {
      const nova = lista.map((a) => (a.chave === chave ? { ...a, lido: true } : a));
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
    () => ({ alertas, naoLidos, conexao, marcarLido, abrir }),
    [alertas, naoLidos, conexao, marcarLido, abrir],
  );
  return <AlertasContext.Provider value={valor}>{children}</AlertasContext.Provider>;
}

export function useAlertas(): Contexto {
  const valor = useContext(AlertasContext);
  if (!valor) throw new Error('useAlertas fora do AlertasProvider');
  return valor;
}
