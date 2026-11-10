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
  /** Marcas "Já passou" (servidor encerra com min(3, confirmações)). */
  resolucoes?: number;
  /** Quando deixou de estar ativa (validade ou "Já passou"). */
  encerrada_em?: string | null;
};

/** Em qual ocorrência o relato do próprio aparelho entrou (GET /v1/relatos/{client_id}). */
export type SituacaoRelato = {
  client_id: string;
  ocorrencia_id: number | null;
  status_ocorrencia: StatusOcorrencia | null;
  confirmacoes: number | null;
};

export type OcorrenciaDetalhe = Ocorrencia & {
  /** Recebimento de cada relato, do mais antigo ao mais novo (últimos 30). */
  linha_do_tempo: string[];
  nota: string | null;
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

/** Espelha LeituraAmbiente (packages/common/src/ecopulse_common/events.py). */
export type HoraPrevista = {
  hora: string;
  temperatura: number;
  codigo_tempo: number;
  chuva_mm: number;
  /** % de chance de chuva na hora. */
  prob_chuva?: number | null;
};

export type LeituraAmbiente = {
  geohash: string;
  latitude: number;
  longitude: number;
  medido_em: string;
  fonte: string;
  temperatura: number | null;
  sensacao: number | null;
  codigo_tempo: number | null;
  minima_dia: number | null;
  maxima_dia: number | null;
  aqi: number | null;
  chuva_mm_h: number | null;
  proximas_horas: HoraPrevista[];
  /** mm/h em 12 intervalos de 15 min (próximas 3 h) */
  chuva_3h: number[];
  /** Vento a 10 m (km/h); direção em graus de onde sopra. Ausentes em leituras antigas. */
  vento_kmh?: number | null;
  vento_direcao?: number | null;
  rajada_kmh?: number | null;
  /** Umidade relativa (%). */
  umidade?: number | null;
  /** Poluente que mais pesa no AQI: pm2_5, pm10, ozonio, no2, so2, co. */
  poluente?: string | null;
  /** Inversão térmica: ar mais quente acima do solo prende a poluição perto do chão. */
  inversao_termica?: boolean | null;
  /** °C do nível acima do terreno menos a 2 m; > 0 indica inversão. */
  inversao_delta_c?: number | null;
};

/** Aparelhos ativos por perto (GET /v1/presenca). */
export type Presenca = {
  aparelhos: number;
  janela_min: number;
};

/** Espelha CelulaAmbiente (GET /v1/ambiente/camada): célula geohash5 com a última leitura. */
export type CelulaAmbiente = {
  geohash: string;
  lat_min: number;
  lon_min: number;
  lat_max: number;
  lon_max: number;
  temperatura: number | null;
  aqi: number | null;
  medido_em: string;
};

/** GET /v1/rotas (services/api/src/ecopulse_api/schemas.py). Coordenadas em [lat, lon]. */
export type ModoRota = 'pedestre' | 'carro';

export type OcorrenciaRota = {
  id: number;
  tipo: TipoRisco;
  severidade: Severidade;
  latitude: number;
  longitude: number;
};

export type RotaDireta = {
  distancia_m: number;
  duracao_s: number;
  coordenadas: [number, number][];
  atravessa: number[];
};

export type RotaSegura = {
  modo: ModoRota;
  distancia_m: number;
  duracao_s: number;
  coordenadas: [number, number][];
  /** Riscos que a direta cruza e esta rota contorna. */
  evitadas: OcorrenciaRota[];
  /** Riscos que esta rota ainda cruza (origem/destino dentro de uma zona, ou sem desvio). */
  no_caminho: OcorrenciaRota[];
  /** Nenhum caminho evita os riscos: esta rota é a direta. */
  sem_desvio: boolean;
  direta: RotaDireta | null;
  aviso: string | null;
};
