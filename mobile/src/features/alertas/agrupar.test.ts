import type { Ocorrencia } from '@/domain/tipos';

import { agruparAlertas } from './agrupar';
import type { ItemAlerta } from './regras';

function ocorrencia(id: number): Ocorrencia {
  return {
    id,
    tipo: 'alagamento',
    severidade: 'critico',
    latitude: -23.5613,
    longitude: -46.6565,
    geohash: '6gycfq',
    confirmacoes: 1,
    status: 'ativa',
    criada_em: '2026-11-07T12:00:00-03:00',
    atualizada_em: '2026-11-07T12:00:00-03:00',
    expira_em: '2026-11-09T12:00:00-03:00',
  };
}

function item(id: number, recebidoEm: string): ItemAlerta {
  return {
    chave: `${id}:critico`,
    ocorrencia: ocorrencia(id),
    distanciaM: 760,
    recebidoEm,
    lido: false,
  };
}

const AGORA = new Date('2026-11-08T00:10:00-03:00');

describe('agruparAlertas', () => {
  it('separa hoje, ontem e antes na virada do dia local', () => {
    const hoje = item(1, '2026-11-08T00:05:00-03:00');
    const ontem = item(2, '2026-11-07T23:55:00-03:00');
    const antes = item(3, '2026-11-06T23:59:00-03:00');

    const grupos = agruparAlertas([hoje, ontem, antes], AGORA);

    expect(grupos.map((grupo) => grupo.rotulo)).toEqual(['Hoje', 'Ontem', 'Antes']);
    expect(grupos[0]?.itens).toEqual([hoje]);
    expect(grupos[1]?.itens).toEqual([ontem]);
    expect(grupos[2]?.itens).toEqual([antes]);
  });

  it('preserva a ordem recebida dentro do grupo e omite grupos vazios', () => {
    const primeiro = item(1, '2026-11-08T00:05:00-03:00');
    const segundo = item(2, '2026-11-08T00:07:00-03:00');
    const antigo = item(3, '2026-10-01T10:00:00-03:00');

    const grupos = agruparAlertas([primeiro, antigo, segundo], AGORA);

    expect(grupos.map((grupo) => grupo.rotulo)).toEqual(['Hoje', 'Antes']);
    expect(grupos[0]?.itens).toEqual([primeiro, segundo]);
    expect(grupos[1]?.itens).toEqual([antigo]);
  });

  it('trata data inválida como "Antes"', () => {
    const grupos = agruparAlertas([item(1, 'não é data')], AGORA);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.rotulo).toBe('Antes');
  });
});
