/**
 * Código de tempo WMO (Open-Meteo) → condição em pt-BR e ícone Solar de clima (bold-duotone).
 * https://open-meteo.com/en/docs (WMO Weather interpretation codes)
 */
import type { NomeIcone } from '@/icons';

export type Condicao = { texto: string; icone: NomeIcone };

export function condicao(codigo: number | null, noite = false): Condicao {
  if (codigo === null) return { texto: 'Sem leitura', icone: 'clouds' };
  if (codigo === 0) return noite ? { texto: 'Céu limpo', icone: 'moon' } : { texto: 'Ensolarado', icone: 'sun-2' };
  if (codigo <= 2) return noite ? { texto: 'Poucas nuvens', icone: 'moon' } : { texto: 'Parcialmente nublado', icone: 'cloud-sun-2' };
  if (codigo === 3) return { texto: 'Nublado', icone: 'clouds' };
  if (codigo === 45 || codigo === 48) return { texto: 'Neblina', icone: 'clouds' };
  if (codigo >= 51 && codigo <= 57) return { texto: 'Garoa', icone: 'cloud-rain' };
  if ((codigo >= 61 && codigo <= 67) || (codigo >= 80 && codigo <= 82)) return { texto: 'Chuva', icone: 'cloud-rain' };
  if (codigo >= 95) return { texto: 'Tempestade', icone: 'cloud-rain' };
  return { texto: 'Nublado', icone: 'clouds' };
}
