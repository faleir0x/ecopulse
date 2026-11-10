// Arquivo gerado a partir do OpenAPI da API. NÃO EDITE À MÃO.
// Regenerar: uv run python -m ecopulse_api.contrato > mobile/src/api/contrato.gerado.ts

export type AparelhoIn = {
  token: string;
  latitude: number;
  longitude: number;
  raio_m: number;
  limiar: Severidade;
  tipos: TipoRisco[];
  silenciado_ate?: string | null;
};

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

export type ConfirmacaoIn = {
  client_id: string;
  device_id: string;
  registrado_em: string;
};

export type HTTPValidationError = {
  detail?: ValidationError[];
};

export type HoraPrevista = {
  hora: string;
  temperatura: number;
  codigo_tempo: number;
  chuva_mm: number;
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
  chuva_3h: number[];
  vento_kmh?: number | null;
  vento_direcao?: number | null;
  rajada_kmh?: number | null;
  umidade?: number | null;
  poluente?: string | null;
  inversao_termica?: boolean | null;
  inversao_delta_c?: number | null;
};

export type LocalEncontrado = {
  nome: string;
  detalhe: string | null;
  latitude: number;
  longitude: number;
};

export type OcorrenciaDetalhe = {
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
  resolucoes?: number;
  encerrada_em?: string | null;
  versao?: number;
  linha_do_tempo: string[];
  nota: string | null;
};

export type OcorrenciaEvitada = {
  id: number;
  tipo: TipoRisco;
  severidade: Severidade;
  latitude: number;
  longitude: number;
};

export type OcorrenciaPayload = {
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
  resolucoes?: number;
  encerrada_em?: string | null;
  versao?: number;
};

export type Presenca = {
  aparelhos: number;
  janela_min: number;
};

export type RelatoAceito = {
  status?: 'aceito';
  client_id: string;
};

export type RelatoIn = {
  client_id: string;
  device_id: string;
  tipo: TipoRisco;
  severidade: Severidade;
  descricao?: string | null;
  latitude: number;
  longitude: number;
  registrado_em: string;
};

export type ResolucaoIn = {
  client_id: string;
  device_id: string;
  registrado_em: string;
};

export type RotaDireta = {
  distancia_m: number;
  duracao_s: number;
  coordenadas: [number, number][];
  atravessa: number[];
};

export type RotaSegura = {
  modo: 'pedestre' | 'carro';
  distancia_m: number;
  duracao_s: number;
  coordenadas: [number, number][];
  evitadas: OcorrenciaEvitada[];
  no_caminho: OcorrenciaEvitada[];
  sem_desvio: boolean;
  direta: RotaDireta | null;
  aviso: string | null;
};

export type Severidade = 'baixo' | 'moderado' | 'alto' | 'critico';

export type SituacaoRelato = {
  client_id: string;
  ocorrencia_id: number | null;
  status_ocorrencia: 'ativa' | 'expirada' | null;
  confirmacoes: number | null;
};

export type StatusOcorrencia = 'ativa' | 'expirada';

export type TelemetriaIn = {
  device_id: string;
  latitude: number;
  longitude: number;
  precisao_m?: number | null;
  registrado_em: string;
};

export type TipoRisco = 'alagamento' | 'calor' | 'qualidade_ar' | 'rota_obstruida';

export type ValidationError = {
  loc: (string | number)[];
  msg: string;
  type: string;
  input?: unknown;
  ctx?: Record<string, unknown>;
};
