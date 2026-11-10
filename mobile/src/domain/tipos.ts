/** Espelha os contratos da API. Os tipos do servidor vêm de `contrato.gerado.ts` (OpenAPI). */
import type {
  CelulaAmbiente as CelulaAmbienteServidor,
  HoraPrevista as HoraPrevistaServidor,
  LeituraAmbiente as LeituraAmbienteServidor,
  OcorrenciaDetalhe as OcorrenciaDetalheServidor,
  OcorrenciaEvitada as OcorrenciaEvitadaServidor,
  OcorrenciaPayload as OcorrenciaPayloadServidor,
  Presenca as PresencaServidor,
  RotaDireta as RotaDiretaServidor,
  RotaSegura as RotaSeguraServidor,
  Severidade as SeveridadeServidor,
  SituacaoRelato as SituacaoRelatoServidor,
  StatusOcorrencia as StatusOcorrenciaServidor,
  TipoRisco as TipoRiscoServidor,
} from '@/api/contrato.gerado';

export type TipoRisco = TipoRiscoServidor;

export const TIPOS_RISCO = [
  'alagamento',
  'calor',
  'qualidade_ar',
  'rota_obstruida',
] as const satisfies readonly TipoRisco[];

/** Ordem crescente de gravidade. */
export type Severidade = SeveridadeServidor;

export const SEVERIDADES = ['baixo', 'moderado', 'alto', 'critico'] as const satisfies readonly Severidade[];

export type StatusOcorrencia = StatusOcorrenciaServidor;

export type Ocorrencia = OcorrenciaPayloadServidor;

/** Em qual ocorrência o relato do próprio aparelho entrou (GET /v1/relatos/{client_id}). */
export type SituacaoRelato = SituacaoRelatoServidor;

export type OcorrenciaDetalhe = OcorrenciaDetalheServidor;

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

/** Espelha HoraPrevista (packages/common/src/ecopulse_common/events.py). */
export type HoraPrevista = HoraPrevistaServidor;

export type LeituraAmbiente = LeituraAmbienteServidor;

/** Aparelhos ativos por perto (GET /v1/presenca). */
export type Presenca = PresencaServidor;

/** Espelha CelulaAmbiente (GET /v1/ambiente/camada): célula geohash5 com a última leitura. */
export type CelulaAmbiente = CelulaAmbienteServidor;

/** GET /v1/rotas (services/api/src/ecopulse_api/schemas.py). Coordenadas em [lat, lon]. */
export type ModoRota = RotaSeguraServidor['modo'];

export type OcorrenciaRota = OcorrenciaEvitadaServidor;

export type RotaDireta = RotaDiretaServidor;

export type RotaSegura = RotaSeguraServidor;
