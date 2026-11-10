/**
 * Cliente do WebSocket /v1/ws (services/realtime/src/ecopulse_realtime/protocolo.py).
 * Reconecta sozinho com backoff e reassina as células ao reconectar.
 */
import { AppState } from 'react-native';

import type { Ocorrencia } from '@/domain/tipos';

export type TipoAlerta = 'ocorrencia.criada' | 'ocorrencia.atualizada' | 'ocorrencia.expirada';
export type Alerta = { type: TipoAlerta; ocorrencia: Ocorrencia };
export type EstadoConexao = 'conectando' | 'conectado' | 'desconectado';

export const PING_MS = 25_000;
export const PONG_TIMEOUT_MS = 10_000;
export const RECONEXAO_MIN_MS = 1_000;
export const RECONEXAO_MAX_MS = 30_000;

export type Opcoes = {
  url: string; // ws://host:porta (o cliente acrescenta /v1/ws)
  criarSocket?: (url: string) => WebSocket;
  aleatorio?: () => number;
  assinarPrimeiroPlano?: (cb: () => void) => () => void;
};

const TIPOS_ALERTA: TipoAlerta[] = [
  'ocorrencia.criada',
  'ocorrencia.atualizada',
  'ocorrencia.expirada',
];

function ehOcorrencia(valor: unknown): valor is Ocorrencia {
  return !!valor && typeof valor === 'object' && !Array.isArray(valor);
}

export class ClienteRealtime {
  private readonly url: string;
  private readonly criarSocket: (url: string) => WebSocket;
  private readonly aleatorio: () => number;
  private readonly observarPrimeiroPlano: (cb: () => void) => () => void;

  private socket: WebSocket | null = null;
  private celulas: string[] = [];
  private estado: EstadoConexao = 'desconectado';
  private tentativas = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private reconexaoTimer: ReturnType<typeof setTimeout> | null = null;
  private cancelarPrimeiroPlano: (() => void) | null = null;
  private fechado = false;
  private alertaOuvintes = new Set<(alerta: Alerta) => void>();
  private estadoOuvintes = new Set<(estado: EstadoConexao) => void>();

  constructor(opcoes: Opcoes) {
    const base = opcoes.url.replace(/\/+$/, '');
    this.url = base.endsWith('/v1/ws') ? base : `${base}/v1/ws`;
    this.criarSocket = opcoes.criarSocket ?? ((url) => new WebSocket(url));
    this.aleatorio = opcoes.aleatorio ?? Math.random;
    this.observarPrimeiroPlano =
      opcoes.assinarPrimeiroPlano ??
      ((cb) => {
        const assinatura = AppState.addEventListener('change', (estado) => {
          if (estado === 'active') {
            cb();
          }
        });
        return () => {
          assinatura.remove();
        };
      });
  }

  private mudarEstado(novo: EstadoConexao): void {
    if (this.estado === novo) {
      return;
    }
    this.estado = novo;
    for (const ouvinte of [...this.estadoOuvintes]) {
      ouvinte(novo);
    }
  }

  private enviar(mensagem: unknown): void {
    if (!this.socket) {
      return;
    }
    try {
      this.socket.send(JSON.stringify(mensagem));
    } catch {
      // O fechamento do socket cuida da reconexão.
    }
  }

  private enviarSubscribe(): void {
    this.enviar({ op: 'subscribe', cells: this.celulas });
  }

  private pararPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private pararPong(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  /**
   * Envia um ping e arma o prazo de PONG_TIMEOUT_MS: qualquer mensagem do servidor o desarma;
   * se vencer, o socket atual é fechado com 4000/"sem resposta" e cai no caminho normal.
   */
  private enviarPing(): void {
    const socket = this.socket;
    if (!socket || this.estado !== 'conectado') {
      return;
    }
    this.enviar({ op: 'ping' });
    this.armarPong(socket);
  }

  private armarPong(socket: WebSocket): void {
    this.pararPong();
    this.pongTimer = setTimeout(() => {
      this.pongTimer = null;
      if (this.socket !== socket) {
        return;
      }
      try {
        socket.close(4000, 'sem resposta');
      } catch {
        // Socket já encerrado.
      }
      if (this.socket === socket) {
        this.aoCair();
      }
    }, PONG_TIMEOUT_MS);
  }

  private iniciarPing(): void {
    this.pararPing();
    const socket = this.socket;
    this.pingTimer = setInterval(() => {
      if (this.socket !== socket || this.estado !== 'conectado') {
        return;
      }
      this.enviarPing();
    }, PING_MS);
  }

  private assinarPrimeiroPlano(): void {
    if (this.cancelarPrimeiroPlano) {
      return;
    }
    this.cancelarPrimeiroPlano = this.observarPrimeiroPlano(() => {
      this.aoVoltarAoPrimeiroPlano();
    });
  }

  private aoVoltarAoPrimeiroPlano(): void {
    if (this.fechado) {
      return;
    }

    if (this.estado === 'conectado') {
      this.enviarPing();
      return;
    }

    if (this.estado === 'desconectado' && this.reconexaoTimer) {
      clearTimeout(this.reconexaoTimer);
      this.reconexaoTimer = null;
      this.tentativas = 0;
      this.conectar();
    }
  }

  private aoCair(): void {
    if (this.fechado) {
      return;
    }

    this.socket = null;
    this.pararPing();
    this.pararPong();
    this.mudarEstado('desconectado');

    if (this.reconexaoTimer) {
      return;
    }

    const base = Math.min(
      RECONEXAO_MIN_MS * 2 ** Math.min(this.tentativas, 20),
      RECONEXAO_MAX_MS,
    );
    this.tentativas += 1;
    const atraso = Math.round(base * (0.8 + this.aleatorio() * 0.4));

    this.reconexaoTimer = setTimeout(() => {
      this.reconexaoTimer = null;
      if (this.fechado) {
        return;
      }
      this.conectar();
    }, atraso);
  }

  private receber(evento: { data: unknown }): void {
    if (typeof evento.data !== 'string') {
      return;
    }

    let mensagem: unknown;
    try {
      mensagem = JSON.parse(evento.data);
    } catch {
      return;
    }

    if (!mensagem || typeof mensagem !== 'object') {
      return;
    }

    const tipo = (mensagem as { type?: unknown }).type;
    if (typeof tipo !== 'string' || !TIPOS_ALERTA.includes(tipo as TipoAlerta)) {
      return;
    }

    const ocorrencia = (mensagem as { ocorrencia?: unknown }).ocorrencia;
    if (!ehOcorrencia(ocorrencia)) {
      return;
    }

    const alerta: Alerta = { type: tipo as TipoAlerta, ocorrencia };
    for (const ouvinte of [...this.alertaOuvintes]) {
      ouvinte(alerta);
    }
  }

  /**
   * Abre a conexão. Ao abrir: envia subscribe com as células atuais (se houver), zera o
   * backoff, agenda ping a cada PING_MS. Ao fechar/erro (sem ter chamado fechar()): agenda
   * reconexão com backoff exponencial RECONEXAO_MIN_MS * 2^n, teto RECONEXAO_MAX_MS, jitter ±20%.
   */
  conectar(): void {
    this.fechado = false;
    this.assinarPrimeiroPlano();
    if (this.socket) {
      return;
    }

    if (this.reconexaoTimer) {
      clearTimeout(this.reconexaoTimer);
      this.reconexaoTimer = null;
    }

    this.mudarEstado('conectando');

    let socket: WebSocket;
    try {
      socket = this.criarSocket(this.url);
    } catch {
      this.aoCair();
      return;
    }

    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) {
        return;
      }
      this.tentativas = 0;
      this.mudarEstado('conectado');
      if (this.celulas.length > 0) {
        this.enviarSubscribe();
      }
      this.iniciarPing();
    };

    socket.onmessage = (evento) => {
      if (this.socket !== socket) {
        return;
      }
      this.pararPong();
      this.receber(evento);
    };

    socket.onerror = () => {
      if (this.socket !== socket) {
        return;
      }
      this.aoCair();
    };

    socket.onclose = () => {
      if (this.socket !== socket) {
        return;
      }
      this.aoCair();
    };
  }

  /** Substitui as células; envia na hora se conectado, senão guarda para a próxima conexão. */
  assinar(celulas: string[]): void {
    this.celulas = [...celulas];
    if (this.estado === 'conectado') {
      this.enviarSubscribe();
    }
  }

  /** Mensagens 'ocorrencia.*' válidas viram Alerta; 'subscribed', 'pong' e 'erro' são internas. */
  aoAlertar(cb: (alerta: Alerta) => void): () => void {
    this.alertaOuvintes.add(cb);
    return () => {
      this.alertaOuvintes.delete(cb);
    };
  }

  aoMudarEstado(cb: (estado: EstadoConexao) => void): () => void {
    this.estadoOuvintes.add(cb);
    return () => {
      this.estadoOuvintes.delete(cb);
    };
  }

  /** Fecha de vez (sem reconectar) e limpa timers e a assinatura de primeiro plano. */
  fechar(): void {
    this.fechado = true;

    if (this.reconexaoTimer) {
      clearTimeout(this.reconexaoTimer);
      this.reconexaoTimer = null;
    }
    this.pararPing();
    this.pararPong();

    if (this.cancelarPrimeiroPlano) {
      this.cancelarPrimeiroPlano();
      this.cancelarPrimeiroPlano = null;
    }

    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try {
        socket.close();
      } catch {
        // Socket já encerrado.
      }
    }

    this.mudarEstado('desconectado');
  }
}
