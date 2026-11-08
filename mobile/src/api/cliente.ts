/** Cliente HTTP da API (docs/ARQUITETURA.md, seção API). */
import { endpoints } from '@/config/endpoints';
import type { LeituraAmbiente, Ocorrencia, OcorrenciaDetalhe, Severidade, TipoRisco } from '@/domain/tipos';
import type { Bbox } from '@/lib/geohash';

export const TIMEOUT_MS = 10_000;

/** status 0 = sem rede/timeout. retryAfterS vem do header Retry-After (429/503). */
export class ApiErro extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly retryAfterS: number | null = null,
  ) {
    super(message);
    this.name = 'ApiErro';
  }
  /** Vale tentar de novo depois (rede, timeout, 429, 5xx). 4xx restantes são definitivos. */
  get temporario(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

export type RelatoEnvio = {
  client_id: string;
  device_id: string;
  tipo: TipoRisco;
  severidade: Severidade;
  descricao: string | null;
  latitude: number;
  longitude: number;
  /** ISO 8601 do momento em que o usuário relatou (pode ser antigo, vindo da fila). */
  registrado_em: string;
};

export type ConfirmacaoEnvio = { client_id: string; device_id: string; registrado_em: string };

type Opcoes = { base?: string; fetch?: typeof fetch; signal?: AbortSignal };

type Inicio = { method?: string; headers?: Record<string, string>; body?: string };

function extrairDetalhe(texto: string): string | null {
  const limpo = texto.trim();
  if (!limpo) {
    return null;
  }
  try {
    const corpo = JSON.parse(limpo) as unknown;
    if (corpo && typeof corpo === 'object' && 'detail' in corpo) {
      const detalhe = (corpo as { detail: unknown }).detail;
      if (typeof detalhe === 'string') {
        return detalhe;
      }
      if (detalhe != null) {
        return JSON.stringify(detalhe);
      }
    }
  } catch {
    // Corpo não é JSON; usa o texto puro.
  }
  return limpo;
}

function lerRetryAfter(resposta: Response): number | null {
  let valor: string | null = null;
  const cabecalhos = resposta.headers as unknown;

  if (cabecalhos && typeof (cabecalhos as { get?: unknown }).get === 'function') {
    const obter = (cabecalhos as { get: (nome: string) => string | null }).get.bind(cabecalhos);
    valor = obter('Retry-After') ?? obter('retry-after');
  } else if (cabecalhos && typeof cabecalhos === 'object') {
    const objeto = cabecalhos as Record<string, string>;
    valor = objeto['Retry-After'] ?? objeto['retry-after'] ?? objeto['RETRY-AFTER'] ?? null;
  }

  if (valor == null) {
    return null;
  }
  const segundos = Number.parseInt(valor, 10);
  return Number.isFinite(segundos) ? segundos : null;
}

async function pedir<T>(caminho: string, inicio: Inicio, op: Opcoes, lerJson: boolean): Promise<T> {
  const base = (op.base ?? endpoints.api).replace(/\/+$/, '');
  const url = `${base}${caminho}`;
  const executar = op.fetch ?? fetch;

  const controlador = new AbortController();
  const externo = op.signal;
  const aoAbortar = () => controlador.abort();
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  if (externo) {
    if (externo.aborted) {
      controlador.abort();
    } else {
      externo.addEventListener('abort', aoAbortar, { once: true });
    }
  }

  try {
    let resposta: Response;
    try {
      resposta = await executar(url, { ...inicio, signal: controlador.signal });
    } catch {
      throw new ApiErro(0, 'sem conexão com a API');
    }

    if (!resposta.ok) {
      let texto = '';
      try {
        texto = typeof resposta.text === 'function' ? await resposta.text() : '';
      } catch {
        texto = '';
      }
      const detalhe = extrairDetalhe(texto) || resposta.statusText || `HTTP ${resposta.status}`;
      throw new ApiErro(resposta.status, detalhe, lerRetryAfter(resposta));
    }

    if (!lerJson) {
      return undefined as T;
    }

    try {
      return (await resposta.json()) as T;
    } catch {
      throw new ApiErro(0, 'resposta inválida da API');
    }
  } finally {
    clearTimeout(temporizador);
    externo?.removeEventListener('abort', aoAbortar);
  }
}

export async function listarOcorrencias(bbox: Bbox, tipo: TipoRisco | null, op: Opcoes = {}): Promise<Ocorrencia[]> {
  // GET /v1/ocorrencias?bbox=lonMin,latMin,lonMax,latMax[&tipo=]
  let caminho = `/v1/ocorrencias?bbox=${bbox.lonMin},${bbox.latMin},${bbox.lonMax},${bbox.latMax}`;
  if (tipo) {
    caminho += `&tipo=${tipo}`;
  }
  return pedir<Ocorrencia[]>(caminho, { method: 'GET' }, op, true);
}

export async function buscarOcorrencia(id: number, op: Opcoes = {}): Promise<OcorrenciaDetalhe> {
  return pedir<OcorrenciaDetalhe>(`/v1/ocorrencias/${id}`, { method: 'GET' }, op, true);
}

export async function enviarRelato(relato: RelatoEnvio, op: Opcoes = {}): Promise<void> {
  // POST /v1/relatos → 202
  await pedir<void>(
    '/v1/relatos',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(relato),
    },
    op,
    false,
  );
}

export async function confirmarOcorrencia(id: number, corpo: ConfirmacaoEnvio, op: Opcoes = {}): Promise<void> {
  // POST /v1/ocorrencias/{id}/confirmacoes → 202
  await pedir<void>(
    `/v1/ocorrencias/${id}/confirmacoes`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo),
    },
    op,
    false,
  );
}

export { endpoints };

/** GET /v1/ambiente?lat=&lon=. null = 404 "sem leitura" (o environment coleta em até 30 s). */
export async function lerAmbiente(lat: number, lon: number, op: Opcoes = {}): Promise<LeituraAmbiente | null> {
  try {
    return await pedir<LeituraAmbiente>(
      `/v1/ambiente?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`,
      { method: 'GET' },
      op,
      true,
    );
  } catch (erro) {
    if (erro instanceof ApiErro && erro.status === 404) return null;
    throw erro;
  }
}
