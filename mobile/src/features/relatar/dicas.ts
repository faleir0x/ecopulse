import type { Severidade, TipoRisco } from '@/domain/tipos';

/**
 * Uma linha de exemplo por tipo e nível, como as do protótipo v6 (constante HINT).
 * As de rota obstruída seguem o mesmo tom curto das demais.
 */
export const DICAS: Record<TipoRisco, Record<Severidade, string>> = {
  alagamento: {
    baixo: 'Poças',
    moderado: 'Até o meio-fio',
    alto: 'Acima do meio-fio',
    critico: 'Intransitável',
  },
  calor: {
    baixo: 'Até 30 °C',
    moderado: '30–34 °C',
    alto: '35–39 °C',
    critico: '40 °C ou mais',
  },
  qualidade_ar: {
    baixo: 'AQI 0–50',
    moderado: 'AQI 51–100',
    alto: 'AQI 101–200',
    critico: 'AQI acima de 200',
  },
  rota_obstruida: {
    baixo: 'Pouco espaço',
    moderado: 'Uma faixa livre',
    alto: 'Via bloqueada em parte',
    critico: 'Passagem impedida',
  },
};

export function dica(tipo: TipoRisco | null, severidade: Severidade | null): string | null {
  if (!tipo || !severidade) {
    return null;
  }
  return DICAS[tipo][severidade];
}
