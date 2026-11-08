import { ApiErro, buscarSituacaoRelato } from '@/api/cliente';

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

const situacao = {
  client_id: 'cliente-1',
  ocorrencia_id: 7,
  status_ocorrencia: 'ativa',
  confirmacoes: 3,
};

describe('buscarSituacaoRelato', () => {
  it('busca a situação pelo client_id', async () => {
    const fetchFake = jest.fn(async () =>
      resposta({ ok: true, status: 200, json: async () => situacao }),
    );

    await expect(
      buscarSituacaoRelato('cliente-1', {
        base: 'http://api.test',
        fetch: fetchFake as unknown as typeof fetch,
      }),
    ).resolves.toEqual(situacao);
    expect(fetchFake).toHaveBeenCalledWith(
      'http://api.test/v1/relatos/cliente-1',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('devolve null quando o relato ainda está processando (404)', async () => {
    const fetchFake = jest.fn(async () =>
      resposta({
        ok: false,
        status: 404,
        headers: { get: () => null },
        text: async () => JSON.stringify({ detail: 'processando' }),
      }),
    );

    await expect(
      buscarSituacaoRelato('cliente-1', {
        base: 'http://api.test',
        fetch: fetchFake as unknown as typeof fetch,
      }),
    ).resolves.toBeNull();
  });

  it('propaga erros que não são 404', async () => {
    const fetchFake = jest.fn(async () =>
      resposta({
        ok: false,
        status: 503,
        headers: { get: () => null },
        text: async () => JSON.stringify({ detail: 'indisponível' }),
      }),
    );

    const erro = await buscarSituacaoRelato('cliente-1', {
      base: 'http://api.test',
      fetch: fetchFake as unknown as typeof fetch,
    }).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ApiErro);
    expect((erro as ApiErro).status).toBe(503);
  });
});
