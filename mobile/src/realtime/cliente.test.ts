import type { Ocorrencia } from '@/domain/tipos';

import {
  ClienteRealtime,
  PING_MS,
  RECONEXAO_MIN_MS,
  type Alerta,
  type EstadoConexao,
} from './cliente';

class SocketFalso {
  enviadas: string[] = [];
  url: string;
  onopen: ((evento: unknown) => void) | null = null;
  onmessage: ((evento: { data: unknown }) => void) | null = null;
  onerror: ((evento: unknown) => void) | null = null;
  onclose: ((evento: unknown) => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(dados: string): void {
    this.enviadas.push(dados);
  }

  close(): void {
    this.onclose?.({});
  }

  abrir(): void {
    this.onopen?.({});
  }

  cair(): void {
    this.onclose?.({});
  }

  receber(mensagem: unknown): void {
    this.onmessage?.({
      data: typeof mensagem === 'string' ? mensagem : JSON.stringify(mensagem),
    });
  }

  envelopes(): Record<string, unknown>[] {
    return this.enviadas.map((item) => JSON.parse(item) as Record<string, unknown>);
  }
}

function montar(url = 'ws://api.test:8002') {
  const sockets: SocketFalso[] = [];
  const cliente = new ClienteRealtime({
    url,
    criarSocket: (destino) => {
      const socket = new SocketFalso(destino);
      sockets.push(socket);
      return socket as unknown as WebSocket;
    },
    aleatorio: () => 0.5,
  });
  return { cliente, sockets };
}

const ocorrencia: Ocorrencia = {
  id: 1,
  tipo: 'alagamento',
  severidade: 'alto',
  latitude: -23.55,
  longitude: -46.63,
  geohash: '6gyf4b',
  confirmacoes: 0,
  status: 'ativa',
  criada_em: '2026-01-01T00:00:00Z',
  atualizada_em: '2026-01-01T00:00:00Z',
  expira_em: '2026-01-01T02:00:00Z',
};

afterEach(() => {
  jest.useRealTimers();
});

describe('ClienteRealtime', () => {
  it('acrescenta /v1/ws e envia subscribe ao abrir', () => {
    const { cliente, sockets } = montar();
    const estados: EstadoConexao[] = [];
    cliente.aoMudarEstado((estado) => estados.push(estado));
    cliente.assinar(['6gyf4b', '6gyf4c']);

    cliente.conectar();
    const socket = sockets[0];
    expect(socket?.url).toBe('ws://api.test:8002/v1/ws');

    socket?.abrir();

    expect(socket?.envelopes()[0]).toEqual({
      op: 'subscribe',
      cells: ['6gyf4b', '6gyf4c'],
    });
    expect(estados).toEqual(['conectando', 'conectado']);

    cliente.fechar();
  });

  it('assinar conectado envia na hora e substitui as células', () => {
    const { cliente, sockets } = montar();
    cliente.conectar();
    sockets[0]?.abrir();

    cliente.assinar(['u4pruy']);

    expect(sockets[0]?.envelopes().at(-1)).toEqual({ op: 'subscribe', cells: ['u4pruy'] });
    cliente.fechar();
  });

  it('entrega apenas alertas válidos aos ouvintes', () => {
    const { cliente, sockets } = montar();
    const alertas: Alerta[] = [];
    cliente.aoAlertar((alerta) => alertas.push(alerta));
    cliente.conectar();
    sockets[0]?.abrir();

    sockets[0]?.receber({ type: 'ocorrencia.criada', ocorrencia });
    sockets[0]?.receber({ type: 'subscribed', cells: ['6gyf4b'] });
    sockets[0]?.receber({ type: 'pong' });
    sockets[0]?.receber({ type: 'erro', motivo: 'célula inválida' });
    sockets[0]?.receber('{ isso não é json');
    sockets[0]?.receber({ type: 'ocorrencia.criada' });

    expect(alertas).toEqual([{ type: 'ocorrencia.criada', ocorrencia }]);
    cliente.fechar();
  });

  it('reconecta com backoff 1 s, 2 s e reenvia o subscribe', () => {
    jest.useFakeTimers();
    const { cliente, sockets } = montar();
    cliente.assinar(['6gyf4b']);
    cliente.conectar();
    sockets[0]?.abrir();

    sockets[0]?.cair();
    expect(sockets).toHaveLength(1);
    jest.advanceTimersByTime(RECONEXAO_MIN_MS - 1);
    expect(sockets).toHaveLength(1);
    jest.advanceTimersByTime(1);
    expect(sockets).toHaveLength(2);

    sockets[1]?.cair();
    jest.advanceTimersByTime(RECONEXAO_MIN_MS * 2 - 1);
    expect(sockets).toHaveLength(2);
    jest.advanceTimersByTime(1);
    expect(sockets).toHaveLength(3);

    sockets[2]?.abrir();
    expect(sockets[2]?.envelopes().at(-1)).toEqual({ op: 'subscribe', cells: ['6gyf4b'] });

    cliente.fechar();
  });

  it('fechar impede qualquer reconexão', () => {
    jest.useFakeTimers();
    const { cliente, sockets } = montar();
    cliente.conectar();
    sockets[0]?.abrir();

    cliente.fechar();
    jest.advanceTimersByTime(60_000);

    expect(sockets).toHaveLength(1);
  });

  it('envia ping a cada 25 s', () => {
    jest.useFakeTimers();
    const { cliente, sockets } = montar();
    cliente.conectar();
    sockets[0]?.abrir();

    jest.advanceTimersByTime(PING_MS - 1);
    expect(sockets[0]?.envelopes().filter((item) => item.op === 'ping')).toHaveLength(0);
    jest.advanceTimersByTime(1);
    expect(sockets[0]?.envelopes().filter((item) => item.op === 'ping')).toHaveLength(1);
    jest.advanceTimersByTime(PING_MS);
    expect(sockets[0]?.envelopes().filter((item) => item.op === 'ping')).toHaveLength(2);

    cliente.fechar();
  });
});
