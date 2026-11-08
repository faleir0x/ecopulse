import { ROTULO_SEVERIDADE, type Severidade } from '@/domain/tipos';
import { useTema } from '@/theme/tema';
import type { EstiloTexto } from '@/theme/tokens';

import { T } from './T';

export type SeverityLabelProps = {
  severidade: Severidade;
  estilo?: EstiloTexto;
};

export function SeverityLabel({ severidade, estilo = 'body' }: SeverityLabelProps) {
  const { sev } = useTema();

  return (
    <T
      estilo={estilo}
      corHex={sev.text[severidade]}
      numberOfLines={1}
      style={{ flexShrink: 1 }}
    >
      {ROTULO_SEVERIDADE[severidade]}
    </T>
  );
}
