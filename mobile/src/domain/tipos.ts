/** Espelha os contratos da API (packages/common/src/ecopulse_common/events.py). */

export const TIPOS_RISCO = ['alagamento', 'calor', 'qualidade_ar', 'rota_obstruida'] as const;
export type TipoRisco = (typeof TIPOS_RISCO)[number];

/** Ordem crescente de gravidade. */
export const SEVERIDADES = ['baixo', 'moderado', 'alto', 'critico'] as const;
export type Severidade = (typeof SEVERIDADES)[number];

export type StatusOcorrencia = 'ativa' | 'expirada';

export type Ocorrencia = {
  id: number;
  tipo: TipoRisco;
  severidade: Severidade;
  latitude: number;
  longitude: number;
  geohash: string;
  confirmacoes: number;
  status: StatusOcorrencia;
  criada_em: string;
  atualizada_em: string;
  expira_em: string;
};

export const ROTULO_TIPO: Record<TipoRisco, string> = {
  alagamento: 'Alagamento',
  calor: 'Calor',
  qualidade_ar: 'Ar',
  rota_obstruida: 'Rota obstruída',
};

export const ROTULO_SEVERIDADE: Record<Severidade, string> = {
  baixo: 'Baixo',
  moderado: 'Moderado',
  alto: 'Alto',
  critico: 'Crítico',
};

export function nivel(severidade: Severidade): 1 | 2 | 3 | 4 {
  return (SEVERIDADES.indexOf(severidade) + 1) as 1 | 2 | 3 | 4;
}
