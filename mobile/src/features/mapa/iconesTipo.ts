/** Ícones Solar por tipo de risco (usado no filtro e nos marcadores). */

import type { NomeIcone } from '@/icons';
import type { TipoRisco } from '@/domain/tipos';

export const ICONE_TIPO: Record<TipoRisco, NomeIcone> = {
  alagamento: 'cloud-waterdrops',
  calor: 'temperature',
  qualidade_ar: 'wind',
  rota_obstruida: 'route',
};
