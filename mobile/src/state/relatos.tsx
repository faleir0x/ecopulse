/**
 * Liga a outbox (SQLite) ao Sincronizador e à rede. Todo relato passa pela outbox, mesmo
 * online: é o mesmo caminho nos dois casos, e uma queda no meio do envio não perde nada.
 */
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { enviarRelato, type RelatoEnvio } from '@/api/cliente';
import { idAparelho } from '@/data/aparelho';
import { abrirBanco } from '@/data/db';
import * as outbox from '@/data/outbox';
import { Sincronizador, type EstadoSync } from '@/data/sincronizacao';

export type NovoRelato = Omit<RelatoEnvio, 'client_id' | 'device_id' | 'registrado_em'>;

type Relatos = {
  estado: EstadoSync;
  /** Grava na outbox e dispara a sincronização. Devolve o client_id. */
  relatar: (relato: NovoRelato, midias: outbox.MidiaLocal[]) => string;
  /** Relatos do aparelho (Meus relatos e marcadores pendentes no mapa). */
  meus: outbox.RelatoLocal[];
  encerrar: (clientId: string) => void;
  /** Tenta enviar a fila agora (ex.: o WebSocket reconectou: o servidor voltou). */
  sincronizarAgora: () => void;
};

const ESTADO_INICIAL: EstadoSync = { online: true, pendentes: 0, enviando: false, ultimoEnvio: null };
const RelatosContext = createContext<Relatos | null>(null);

/** Só os campos do contrato da API (a outbox guarda status, tentativas e mídia junto). */
export function paraEnvio(relato: outbox.RelatoLocal): RelatoEnvio {
  const { client_id, device_id, tipo, severidade, descricao, latitude, longitude, registrado_em } = relato;
  return { client_id, device_id, tipo, severidade, descricao, latitude, longitude, registrado_em };
}

export function RelatosProvider({ children }: { children: ReactNode }) {
  const db = useMemo(() => abrirBanco(), []);
  const clienteQuery = useQueryClient();
  const [estado, setEstado] = useState<EstadoSync>(ESTADO_INICIAL);
  const [meus, setMeus] = useState<outbox.RelatoLocal[]>(() => outbox.meusRelatos(db));

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
    const cancelar = sincronizador.ouvir((novo) => {
      setEstado(novo);
      setMeus(outbox.meusRelatos(db));
      // Um relato acabou de sair: o mapa busca de novo (o WebSocket da 4.5 também avisa)
      if (novo.ultimoEnvio) void clienteQuery.invalidateQueries({ queryKey: ['ocorrencias'] });
    });
    // iniciar() assina a rede, que já notifica o estado atual pelos ouvintes
    sincronizador.iniciar();
    return () => {
      cancelar();
      sincronizador.parar();
    };
  }, [sincronizador, db, clienteQuery]);

  const relatar = useCallback(
    (relato: NovoRelato, midias: outbox.MidiaLocal[]) => {
      const clientId = randomUUID();
      outbox.enfileirar(
        db,
        { ...relato, client_id: clientId, device_id: idAparelho(), registrado_em: new Date().toISOString() },
        midias,
        Date.now(),
      );
      setMeus(outbox.meusRelatos(db));
      setEstado(sincronizador.estado());
      void sincronizador.sincronizarAgora();
      return clientId;
    },
    [db, sincronizador],
  );

  const encerrar = useCallback(
    (clientId: string) => {
      outbox.marcarEncerrado(db, clientId);
      setMeus(outbox.meusRelatos(db));
    },
    [db],
  );

  const sincronizarAgora = useCallback(() => {
    void sincronizador.sincronizarAgora();
  }, [sincronizador]);

  const valor = useMemo(
    () => ({ estado, relatar, meus, encerrar, sincronizarAgora }),
    [estado, relatar, meus, encerrar, sincronizarAgora],
  );
  return <RelatosContext.Provider value={valor}>{children}</RelatosContext.Provider>;
}

export function useRelatos(): Relatos {
  const valor = useContext(RelatosContext);
  if (!valor) throw new Error('useRelatos fora do RelatosProvider');
  return valor;
}
