import {
  ApiErro,
  buscarOcorrencia,
  confirmarOcorrencia,
  enviarRelato,
  listarOcorrencias,
  TIMEOUT_MS,
  type RelatoEnvio,
} from './cliente';

type RespostaFalsa = {
  ok: boolean;
  status: number;
  statusText?: string;
  headers?: { get(nome: string): string | null };
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

function resposta(dados: RespostaFalsa): Response {
  return dados as unknown as Response;
}

const ocorrencia = {
  id: 7,
  tipo: 'alagamento',
  severidade: 'alto',
  latitude: -23.55,
  longitude: -46.63,
  geohash: '6gyf4b',
  confirmacoes: 2,
  status: 'ativa',
  criada_em: '2026-01-01T00:00:00Z',
  atualizada_em: '2026-01-01T00:00:00Z',
  expira_em: '2026-01-01T02:00:00Z',
};

const relato: RelatoEnvio = {
  client_id: 'cliente-1',
  device_id: 'aparelho-1',
  tipo: 'alagamento',
  severidade: 'alto',
  descricao: null,
  latitude: -23.55,
  longitude: -46.63,
  registrado_em: '2026-01-01T00:00:00Z',
};

afterEach(() => {
  jest.useRealTimers();
});

describe('cliente HTTP', () => {
  it('monta a URL do mapa com bbox e tipo', async () => {
    const fetchFake = jest.fn(async () =>
      resposta({ ok: true, status: 200, json: async () => [ocorrencia] }),
    );

    const lista = await listarOcorrencias(
      { latMin: -23.6, lonMin: -46.7, latMax: -23.5, lonMax: -46.5 },
      'alagamento',
      { base: 'http://api.test/', fetch: fetchFake as unknown as typeof fetch },
    );

    expect(lista).toEqual([ocorrencia]);
    expect(fetchFake).toHaveBeenCalledWith(
      'http://api.test/v1/ocorrencias?bbox=-46.7,-23.6,-46.5,-23.5&tipo=alagamento',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('busca uma ocorrência por id', async () => {
    const fetchFake = jest.fn(async () =>
      resposta({ ok: true, status: 200, json: async () => ocorrencia }),
    );

    await expect(
      buscarOcorrencia(7, { base: 'http://api.test', fetch: fetchFake as unknown as typeof fetch }),
    ).resolves.toEqual(ocorrencia);
    expect(fetchFake).toHaveBeenCalledWith(
      'http://api.test/v1/ocorrencias/7',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('envia relato e confirmação com JSON no corpo', async () => {
    const fetchFake = jest.fn(async () => resposta({ ok: true, status: 202 }));

    await enviarRelato(relato, {
      base: 'http://api.test',
      fetch: fetchFake as unknown as typeof fetch,
    });
    await confirmarOcorrencia(
      3,
      { client_id: 'c-2', device_id: 'd-2', registrado_em: '2026-01-01T00:00:00Z' },
      { base: 'http://api.test', fetch: fetchFake as unknown as typeof fetch },
    );

    expect(fetchFake).toHaveBeenNthCalledWith(
      1,
      'http://api.test/v1/relatos',
      expect.objectContaining({ method: 'POST', body: JSON.stringify(relato) }),
    );
    expect(fetchFake).toHaveBeenNthCalledWith(
      2,
      'http://api.test/v1/ocorrencias/3/confirmacoes',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          client_id: 'c-2',
          device_id: 'd-2',
          registrado_em: '2026-01-01T00:00:00Z',
        }),
      }),
    );
  });

  it('transforma falha de rede em ApiErro(0)', async () => {
    const fetchFake = jest.fn(async () => {
      throw new TypeError('rede fora');
    });

    const erro = await enviarRelato(relato, {
      base: 'http://api.test',
      fetch: fetchFake as unknown as typeof fetch,
    }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ApiErro);
    expect((erro as ApiErro).status).toBe(0);
    expect((erro as ApiErro).retryAfterS).toBeNull();
    expect((erro as ApiErro).temporario).toBe(true);
  });

  it('lê detail e Retry-After de respostas não 2xx', async () => {
    const fetchFake = jest.fn(async () =>
      resposta({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: { get: (nome) => (nome.toLowerCase() === 'retry-after' ? '30' : null) },
        text: async () => JSON.stringify({ detail: 'broker indisponível' }),
      }),
    );

    const erro = await enviarRelato(relato, {
      base: 'http://api.test',
      fetch: fetchFake as unknown as typeof fetch,
    }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ApiErro);
    expect((erro as ApiErro).status).toBe(503);
    expect((erro as ApiErro).message).toBe('broker indisponível');
    expect((erro as ApiErro).retryAfterS).toBe(30);
    expect((erro as ApiErro).temporario).toBe(true);
  });

  it('marca 422 como erro definitivo', async () => {
    const fetchFake = jest.fn(async () =>
      resposta({
        ok: false,
        status: 422,
        headers: { get: () => null },
        text: async () => JSON.stringify({ detail: 'dados inválidos' }),
      }),
    );

    const erro = await listarOcorrencias(
      { latMin: 0, lonMin: 0, latMax: 1, lonMax: 1 },
      null,
      { base: 'http://api.test', fetch: fetchFake as unknown as typeof fetch },
    ).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ApiErro);
    expect((erro as ApiErro).status).toBe(422);
    expect((erro as ApiErro).temporario).toBe(false);
  });

  it('aborta por timeout e devolve ApiErro(0)', async () => {
    jest.useFakeTimers();
    const fetchFake = jest.fn(
      (_url: string, inicio?: RequestInit) =>
        new Promise<Response>((_resolver, rejeitar) => {
          inicio?.signal?.addEventListener('abort', () => rejeitar(new Error('abortado')));
        }),
    );

    const promessa = listarOcorrencias(
      { latMin: 0, lonMin: 0, latMax: 1, lonMax: 1 },
      null,
      { base: 'http://api.test', fetch: fetchFake as unknown as typeof fetch },
    );

    jest.advanceTimersByTime(TIMEOUT_MS);
    await expect(promessa).rejects.toMatchObject({ status: 0 });
  });

  it('combina o signal externo com o timeout', async () => {
    const controlador = new AbortController();
    const fetchFake = jest.fn(
      (_url: string, inicio?: RequestInit) =>
        new Promise<Response>((_resolver, rejeitar) => {
          inicio?.signal?.addEventListener('abort', () => rejeitar(new Error('abortado')));
        }),
    );

    const promessa = enviarRelato(relato, {
      base: 'http://api.test',
      fetch: fetchFake as unknown as typeof fetch,
      signal: controlador.signal,
    });
    controlador.abort();

    await expect(promessa).rejects.toMatchObject({ status: 0 });
  });
});
