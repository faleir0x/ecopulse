/** Quando um evento do WebSocket vira alerta para o usuário. Funções puras (testadas). */
import { nivel, type Ocorrencia, type Severidade, type TipoRisco } from '@/domain/tipos';
import { distanciaM } from '@/lib/distancia';
import type { Alerta as EventoRealtime } from '@/realtime/cliente';

export type ItemAlerta = {
  /** ocorrencia.id + severidade: a mesma ocorrência só alerta de novo se piorar */
  chave: string;
  ocorrencia: Ocorrencia;
  distanciaM: number;
  recebidoEm: string;
  lido: boolean;
};

export type Contexto = {
  posicao: { latitude: number; longitude: number } | null;
  raioM: number;
  limiar: Severidade;
  tiposAtivos: TipoRisco[];
  /** Severidade já alertada por ocorrência (para não repetir a cada confirmação). */
  jaAlertada: ReadonlyMap<number, Severidade>;
};

/**
 * Alerta quando: tipo ativo, dentro do raio, nível >= limiar e (é nova OU piorou desde o último
 * alerta). Expirada nunca alerta. Devolve null se não deve alertar.
 */
export function avaliar(evento: EventoRealtime, ctx: Contexto, agora: Date): ItemAlerta | null {
  const o = evento.ocorrencia;
  if (evento.type === 'ocorrencia.expirada' || o.status !== 'ativa') return null;
  if (!ctx.tiposAtivos.includes(o.tipo)) return null;
  if (nivel(o.severidade) < nivel(ctx.limiar)) return null;
  if (!ctx.posicao) return null;
  const d = distanciaM(ctx.posicao.latitude, ctx.posicao.longitude, o.latitude, o.longitude);
  if (d > ctx.raioM) return null;
  const anterior = ctx.jaAlertada.get(o.id);
  if (anterior && nivel(o.severidade) <= nivel(anterior)) return null;
  return {
    chave: `${o.id}:${o.severidade}`,
    ocorrencia: o,
    distanciaM: d,
    recebidoEm: agora.toISOString(),
    lido: false,
  };
}

export const MAX_ALERTAS = 100;

/** Novo no topo, sem duplicar a chave, limitado a MAX_ALERTAS. */
export function acrescentar(lista: ItemAlerta[], item: ItemAlerta): ItemAlerta[] {
  return [item, ...lista.filter((a) => a.chave !== item.chave)].slice(0, MAX_ALERTAS);
}
