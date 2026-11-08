import { ApiErro, type RelatoEnvio } from '@/api/cliente';

import type { RelatoLocal } from './outbox';
import {
  Sincronizador,
  type EstadoSync,
  type RepositorioOutbox,
} from './sincronizacao';

function criarRelato(clientId: string, criadoEm: number): RelatoLocal {
  return {
    client_id: clientId,
    device_id: 'aparelho-1',
    tipo: 'alagamento',
    severidade: 'alto',
    descricao: null,
    latitude: -23.55,
    longitude: -46.63,
    registrado_em: '2026-01-01T00:00:00Z',
    status: 'pendente',
    tentativas: 0,
    proxima_tentativa_em: null,
    ultimo_erro: null,
    midias: [],
    criado_em: criadoEm,
    enviado_em: null,
  };
}

class RepoFake implements RepositorioOutbox {
  itens: RelatoLocal[];

  constructor(itens: RelatoLocal[]) {
    this.itens = itens.map((item) => ({ ...item }));
  }

  prontos(agora: number): RelatoLocal[] {
    return this.itens
      .filter(
        (item) =>
          item.status === 'pendente' &&
          (item.proxima_tentativa_em === null || item.proxima_tentativa_em <= agora),
      )
      .sort((a, b) => a.criado_em - b.criado_em);
  }

  private achar(clientId: string): RelatoLocal | undefined {
    return this.itens.find((item) => item.client_id === clientId);
  }

  marcarEnviado(clientId: string, agora: number): void {
    const item = this.achar(clientId);
    if (item) {
      item.status = 'enviado';
      item.enviado_em = agora;
      item.proxima_tentativa_em = null;
    }
  }

  marcarRejeitado(clientId: string, erro: string): void {
    const item = this.achar(clientId);
    if (item) {
      item.status = 'rejeitado';
      item.ultimo_erro = erro;
      item.proxima_tentativa_em = null;
    }
  }

  registrarFalha(clientId: string, erro: string, agora: number, retryAfterS: number | null): void {
    const item = this.achar(clientId);
    if (item) {
      item.tentativas += 1;
      item.ultimo_erro = erro;
      item.proxima_tentativa_em =
        retryAfterS == null ? agora + 2000 * 2 ** (item.tentativas - 1) : agora + retryAfterS * 1000;
    }
  }

  contarPendentes(): number {
    return this.itens.filter((item) => item.status === 'pendente').length;
  }
}

class RedeFake {
  private cb: ((online: boolean) => void) | null = null;

  observar = (cb: (online: boolean) => void): (() => void) => {
    this.cb = cb;
    return () => {
      this.cb = null;
    };
  };

  emitir(online: boolean): void {
    this.cb?.(online);
  }
}

function montar(
  itens: RelatoLocal[],
  enviar: (relato: RelatoEnvio) => Promise<void>,
  agoraInicial = 1000,
) {
  const repo = new RepoFake(itens);
  const rede = new RedeFake();
  let agora = agoraInicial;
  const sync = new Sincronizador({
    repo,
    enviar,
    observarRede: rede.observar,
    agora: () => agora,
    intervaloMs: 1000,
  });
  return {
    repo,
    rede,
    sync,
    definirAgora: (valor: number) => {
      agora = valor;
    },
  };
}

afterEach(() => {
  jest.useRealTimers();
});

describe('Sincronizador', () => {
  it('envia os prontos em ordem e marca como enviados', async () => {
    const enviar = jest.fn<Promise<void>, [RelatoEnvio]>(async () => undefined);
    const { repo, sync } = montar(
      [criarRelato('mais-novo', 200), criarRelato('mais-antigo', 100)],
      enviar,
    );

    await sync.sincronizarAgora();

    expect(enviar.mock.calls.map(([relato]) => relato.client_id)).toEqual([
      'mais-antigo',
      'mais-novo',
    ]);
    expect(repo.itens.every((item) => item.status === 'enviado')).toBe(true);
    expect(repo.itens[0]?.enviado_em).toBe(1000);
  });

  it('com 503 agenda nova tentativa com Retry-After', async () => {
    const enviar = jest.fn(async () => {
      throw new ApiErro(503, 'broker indisponível', 30);
    });
    const { repo, sync } = montar([criarRelato('a', 100)], enviar);

    await sync.sincronizarAgora();

    expect(repo.itens[0]?.tentativas).toBe(1);
    expect(repo.itens[0]?.proxima_tentativa_em).toBe(1000 + 30_000);
    expect(repo.itens[0]?.ultimo_erro).toBe('broker indisponível');
  });

  it('para a rodada quando o erro é ApiErro(0)', async () => {
    const enviar = jest.fn(async () => {
      throw new ApiErro(0, 'sem rede');
    });
    const { repo, sync } = montar(
      [criarRelato('primeiro', 100), criarRelato('segundo', 200)],
      enviar,
    );

    await sync.sincronizarAgora();

    expect(enviar).toHaveBeenCalledTimes(1);
    expect(repo.itens[0]?.tentativas).toBe(1);
    expect(repo.itens[0]?.proxima_tentativa_em).not.toBeNull();
    expect(repo.itens[1]?.status).toBe('pendente');
    expect(repo.itens[1]?.tentativas).toBe(0);
  });

  it('rejeita 422 e segue para o próximo relato', async () => {
    const enviar = jest
      .fn<Promise<void>, [RelatoEnvio]>()
      .mockRejectedValueOnce(new ApiErro(422, 'dados inválidos'))
      .mockResolvedValueOnce(undefined);
    const { repo, sync } = montar(
      [criarRelato('inválido', 100), criarRelato('válido', 200)],
      enviar,
    );

    await sync.sincronizarAgora();

    expect(enviar).toHaveBeenCalledTimes(2);
    expect(repo.itens[0]?.status).toBe('rejeitado');
    expect(repo.itens[0]?.ultimo_erro).toBe('dados inválidos');
    expect(repo.itens[1]?.status).toBe('enviado');
  });

  it('não envia enquanto está offline', async () => {
    const enviar = jest.fn(async () => undefined);
    const { rede, sync } = montar([criarRelato('a', 100)], enviar);

    sync.iniciar();
    rede.emitir(false);
    await sync.sincronizarAgora();

    expect(enviar).not.toHaveBeenCalled();
    sync.parar();
  });

  it('sincroniza ao ficar online', async () => {
    const enviar = jest.fn(async () => undefined);
    const { rede, sync } = montar([criarRelato('a', 100)], enviar);

    sync.iniciar();
    rede.emitir(true);
    await sync.sincronizarAgora();

    expect(enviar).toHaveBeenCalledTimes(1);
    sync.parar();
  });

  it('reaproveita a rodada em andamento em chamadas simultâneas', async () => {
    let liberar: () => void = () => undefined;
    const enviar = jest.fn(
      () =>
        new Promise<void>((resolver) => {
          liberar = resolver;
        }),
    );
    const { repo, sync } = montar([criarRelato('a', 100)], enviar);

    const primeira = sync.sincronizarAgora();
    const segunda = sync.sincronizarAgora();

    expect(segunda).toBe(primeira);
    expect(enviar).toHaveBeenCalledTimes(1);

    liberar();
    await primeira;
    expect(repo.itens[0]?.status).toBe('enviado');
  });

  it('notifica os ouvintes com os estados da rodada', async () => {
    const enviar = jest.fn(async () => undefined);
    const { sync } = montar([criarRelato('a', 100)], enviar);
    const estados: EstadoSync[] = [];

    sync.ouvir((estado) => estados.push(estado));
    await sync.sincronizarAgora();

    expect(estados.some((estado) => estado.enviando)).toBe(true);
    expect(estados.at(-1)).toEqual({
      online: true,
      pendentes: 0,
      enviando: false,
      ultimoEnvio: 1000,
    });
  });

  it('verifica a fila no intervalo configurado', async () => {
    jest.useFakeTimers();
    const enviar = jest.fn(async () => undefined);
    const { sync } = montar([criarRelato('a', 100)], enviar);

    sync.iniciar();
    await jest.advanceTimersByTimeAsync(1000);

    expect(enviar).toHaveBeenCalledTimes(1);
    sync.parar();
  });
});
