/**
 * Liga a outbox (SQLite) ao Sincronizador e à rede. Todo relato passa pela outbox, mesmo
 * online: é o mesmo caminho nos dois casos, e uma queda no meio do envio não perde nada.
 */
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { enviarRelato, type RelatoEnvio } from '@/api/cliente';
import { idAparelho } from '@/data/aparelho';
import { abrirBanco } from '@/data/db';
import * as outbox from '@/data/outbox';
import { Sincronizador, type EstadoSync } from '@/data/sincronizacao';

export type NovoRelato = Omit<RelatoEnvio, 'client_id' | 'device_id' | 'registrado_em'>;

export type ResultadoRelato = 'enviado' | 'na_fila' | 'rejeitado';

/** Resolve com o resultado da 1ª tentativa e carrega o client_id para o "Tentar de novo". */
export type EnvioRelato = Promise<ResultadoRelato> & { clientId: string };

type Relatos = {
  estado: EstadoSync;
  /** Grava na outbox e resolve com o resultado da primeira sincronização (sem esperar offline). */
  relatar: (relato: NovoRelato, midias: outbox.MidiaLocal[]) => EnvioRelato;
  /** Relatos do aparelho (Meus relatos e marcadores pendentes no mapa). */
  meus: outbox.RelatoLocal[];
  encerrar: (clientId: string) => void;
  /** Desiste do envio de um relato ainda pendente (não mexe em enviados/encerrados). */
  cancelar: (clientId: string) => void;
  /** Tenta enviar a fila agora (ex.: o WebSocket reconectou: o servidor voltou). */
  sincronizarAgora: () => void;
  /** Nova tentativa só daquele relato, ignorando o backoff agendado. */
  tentarDeNovo: (clientId: string) => Promise<ResultadoRelato>;
};

const ESTADO_INICIAL: EstadoSync = { online: true, pendentes: 0, enviando: false, ultimoEnvio: null };
const RelatosContext = createContext<Relatos | null>(null);

/** Só os campos do contrato da API (a outbox guarda status, tentativas e mídia junto). */
export function paraEnvio(relato: outbox.RelatoLocal): RelatoEnvio {
  const { client_id, device_id, tipo, severidade, descricao, latitude, longitude, registrado_em } = relato;
  return { client_id, device_id, tipo, severidade, descricao, latitude, longitude, registrado_em };
}

function resultadoNaOutbox(db: ReturnType<typeof abrirBanco>, clientId: string): ResultadoRelato {
  const relato = outbox.meusRelatos(db).find((item) => item.client_id === clientId);
  if (relato?.status === 'enviado') return 'enviado';
  if (relato?.status === 'rejeitado') return 'rejeitado';
  return 'na_fila';
}

export function RelatosProvider({ children }: { children: ReactNode }) {
  const db = useMemo(() => abrirBanco(), []);
  const clienteQuery = useQueryClient();
  const [estado, setEstado] = useState<EstadoSync>(ESTADO_INICIAL);
  const [meus, setMeus] = useState<outbox.RelatoLocal[]>(() => outbox.meusRelatos(db));
  /** Último estado aplicado: evita reler o SQLite inteiro a cada notificação repetida. */
  const estadoRef = useRef<EstadoSync>(ESTADO_INICIAL);

  const aplicarEstado = useCallback(
    (novo: EstadoSync) => {
      const anterior = estadoRef.current;
      if (
        anterior.online === novo.online &&
        anterior.pendentes === novo.pendentes &&
        anterior.enviando === novo.enviando &&
        anterior.ultimoEnvio === novo.ultimoEnvio
      ) {
        return;
      }

      estadoRef.current = novo;
      setEstado(novo);

      // Só releia a lista quando a fila ou o último envio mudarem (cada leitura é um SELECT *).
      if (anterior.pendentes !== novo.pendentes || anterior.ultimoEnvio !== novo.ultimoEnvio) {
        setMeus(outbox.meusRelatos(db));
      }

      // Um envio bem-sucedido pode ter criado/atualizado uma ocorrência: o mapa rebusca.
      if (anterior.ultimoEnvio !== novo.ultimoEnvio) {
        void clienteQuery.invalidateQueries({ queryKey: ['ocorrencias'] });
      }
    },
    [db, clienteQuery],
  );

  const sincronizador = useMemo(
    () =>
      new Sincronizador({
        repo: {
          prontos: (agora) => outbox.prontos(db, agora),
          marcarEnviado: (id, agora) => outbox.marcarEnviado(db, id, agora),
          marcarRejeitado: (id, erro) => outbox.marcarRejeitado(db, id, erro),
          registrarFalha: (id, erro, agora, retry) => outbox.registrarFalha(db, id, erro, agora, retry),
          contarPendentes: () => outbox.contarPendentes(db),
        },
        enviar: (relato) => enviarRelato(paraEnvio(relato as outbox.RelatoLocal)),
        observarRede: (cb) =>
          NetInfo.addEventListener((rede) => cb(rede.isConnected !== false && rede.isInternetReachable !== false)),
      }),
    [db],
  );

  useEffect(() => {
    const cancelarOuvinte = sincronizador.ouvir(aplicarEstado);
    // iniciar() assina a rede, que já notifica o estado atual pelos ouvintes
    sincronizador.iniciar();
    return () => {
      cancelarOuvinte();
      sincronizador.parar();
    };
  }, [sincronizador, aplicarEstado]);

  const tentarEnvio = useCallback(
    async (clientId: string): Promise<ResultadoRelato> => {
      await sincronizador.sincronizarAgora();
      // Uma rodada que já estava em andamento devolve a própria promessa sem incluir este
      // relato: se ele ainda não teve tentativa, roda mais uma vez antes de responder
      const local = outbox.meusRelatos(db).find((item) => item.client_id === clientId);
      if (local?.status === 'pendente' && local.tentativas === 0) {
        await sincronizador.sincronizarAgora();
      }
      // tentativas/último_erro mudam sem alterar a contagem: relê sempre antes de responder.
      setMeus(outbox.meusRelatos(db));
      aplicarEstado(sincronizador.estado());
      return resultadoNaOutbox(db, clientId);
    },
    [db, sincronizador, aplicarEstado],
  );

  const relatar = useCallback(
    (relato: NovoRelato, midias: outbox.MidiaLocal[]) => {
      const clientId = randomUUID();
      outbox.enfileirar(
        db,
        { ...relato, client_id: clientId, device_id: idAparelho(), registrado_em: new Date().toISOString() },
        midias,
        Date.now(),
      );
      aplicarEstado(sincronizador.estado());
      const promessa = tentarEnvio(clientId) as EnvioRelato;
      promessa.clientId = clientId;
      return promessa;
    },
    [db, sincronizador, tentarEnvio, aplicarEstado],
  );

  const tentarDeNovo = useCallback(
    async (clientId: string): Promise<ResultadoRelato> => {
      // "Tentar de novo" é um pedido explícito: não espera o backoff agendado.
      db.runSync(
        `UPDATE relatos SET proxima_tentativa_em = NULL WHERE client_id = ? AND status = 'pendente'`,
        [clientId],
      );
      return tentarEnvio(clientId);
    },
    [db, tentarEnvio],
  );

  const encerrar = useCallback(
    (clientId: string) => {
      outbox.marcarEncerrado(db, clientId);
      setMeus(outbox.meusRelatos(db));
      aplicarEstado(sincronizador.estado());
    },
    [db, sincronizador, aplicarEstado],
  );

  const cancelar = useCallback(
    (clientId: string) => {
      outbox.cancelarPendente(db, clientId);
      // A contagem de pendentes muda: aplicarEstado atualiza o pill e relê "Meus relatos".
      aplicarEstado(sincronizador.estado());
    },
    [db, sincronizador, aplicarEstado],
  );

  const sincronizarAgora = useCallback(() => {
    void sincronizador.sincronizarAgora();
  }, [sincronizador]);

  const valor = useMemo(
    () => ({ estado, relatar, meus, encerrar, cancelar, sincronizarAgora, tentarDeNovo }),
    [estado, relatar, meus, encerrar, cancelar, sincronizarAgora, tentarDeNovo],
  );
  return <RelatosContext.Provider value={valor}>{children}</RelatosContext.Provider>;
}

export function useRelatos(): Relatos {
  const valor = useContext(RelatosContext);
  if (!valor) throw new Error('useRelatos fora do RelatosProvider');
  return valor;
}
