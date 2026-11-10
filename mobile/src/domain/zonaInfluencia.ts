/**
 * Zona de influência de uma ocorrência, por severidade: área em que ela afeta quem está perto.
 * Mesmos valores do servidor (packages/common/src/ecopulse_common/zonas.py); um teste do
 * backend lê este arquivo e falha se divergirem — mude os dois juntos.
 */
import type { Severidade } from '@/domain/tipos';

export const RAIO_INFLUENCIA_M: Record<Severidade, number> = {
  baixo: 150,
  moderado: 300,
  alto: 500,
  critico: 800,
};

export const RAIO_INFLUENCIA_MAX_M = RAIO_INFLUENCIA_M.critico;
