import type { Ocorrencia } from '@/domain/tipos';

import { agruparPorDia } from './agrupar';
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


describe('agruparPorDia', () => {
  // domingo, 8 nov 2026
  const agora = new Date(2026, 10, 8, 10, 0);

  it('mostra sempre os últimos 7 dias, do mais recente ao mais antigo', () => {
    const dias = agruparPorDia(
      [
        item(1, new Date(2026, 10, 8, 9, 0).toISOString()),
        item(2, new Date(2026, 10, 7, 23, 59).toISOString()),
        item(3, new Date(2026, 10, 6, 8, 0).toISOString()),
        item(4, new Date(2026, 10, 8, 0, 1).toISOString()),
      ],
      agora,
    );

    expect(dias.map((dia) => dia.rotulo)).toEqual([
      'Hoje',
      'Ontem',
      'sex 6',
      'qui 5',
      'qua 4',
      'ter 3',
      'seg 2',
    ]);
    expect(dias[0]!.itens.map((i) => i.ocorrencia.id)).toEqual([1, 4]);
    expect(dias[3]!.itens).toEqual([]);
  });

  it('acrescenta dias mais antigos só se tiverem alerta e ignora datas inválidas', () => {
    const dias = agruparPorDia(
      [item(1, 'não é data'), item(2, new Date(2026, 9, 20).toISOString())],
      agora,
    );

    expect(dias).toHaveLength(8);
    expect(dias[7]!.rotulo).toBe('20 out');
    expect(dias.slice(0, 7).every((dia) => dia.itens.length === 0)).toBe(true);
  });
});
