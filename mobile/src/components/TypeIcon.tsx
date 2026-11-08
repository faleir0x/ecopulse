import type { TipoRisco } from '@/domain/tipos';
import { Icon } from '@/icons/Icon';
import type { NomeIcone } from '@/icons';
import { tamanho } from '@/theme/tokens';

const ICONE_TIPO: Record<TipoRisco, NomeIcone> = {
  alagamento: 'cloud-waterdrops',
  calor: 'temperature',
  qualidade_ar: 'wind',
  rota_obstruida: 'route',
};

export type TypeIconProps = {
  tipo: TipoRisco;
  ativo?: boolean;
  tamanho?: number;
};

export function TypeIcon({ tipo, ativo = false, tamanho: medida = tamanho.icon }: TypeIconProps) {
  return <Icon name={ICONE_TIPO[tipo]} peso={ativo ? 'bold' : 'linear'} tamanho={medida} />;
}
