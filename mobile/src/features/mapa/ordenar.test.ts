import type { Ocorrencia, Severidade, TipoRisco } from '@/domain/tipos';

import { ocorrenciasNoRaio, ordenarPorSeveridadeEDistancia } from './ordenar';

let sequencia = 0;

function ocorrencia(
  severidade: Severidade,
  latitude: number,
  longitude: number,
  tipo: TipoRisco = 'alagamento',
): Ocorrencia {
  sequencia += 1;
  return {
    id: sequencia,
    tipo,
    severidade,
    latitude,
    longitude,
    geohash: '6gyf4',
    confirmacoes: 1,
    status: 'ativa',
    criada_em: '2026-11-07T12:00:00Z',
    atualizada_em: '2026-11-07T12:00:00Z',
    expira_em: '2026-11-08T12:00:00Z',
  };
}

const ORIGEM = { latitude: -23.5613, longitude: -46.6565 };

describe('ordenarPorSeveridadeEDistancia', () => {
  it('ordena por severidade decrescente e depois por distância crescente', () => {
    const lista = [
      ocorrencia('baixo', -23.5623, -46.6565),
      ocorrencia('critico', -23.5703, -46.6565), // ~1 km
      ocorrencia('critico', -23.5616, -46.6565), // mais perto
      ocorrencia('alto', -23.5618, -46.6565),
    ];

    const ordenado = ordenarPorSeveridadeEDistancia(lista, ORIGEM);

    expect(ordenado.map((o) => o.severidade)).toEqual(['critico', 'critico', 'alto', 'baixo']);
    // entre os dois críticos, o mais perto vem primeiro
    expect(ordenado[0]!.latitude).toBeCloseTo(-23.5616);
    expect(ordenado[1]!.latitude).toBeCloseTo(-23.5703);
  });
});

describe('ocorrenciasNoRaio', () => {
  it('deixa de fora o que está além do raio', () => {
    const lista = [
      ocorrencia('baixo', -23.5618, -46.6565),
      ocorrencia('critico', -23.9001, -46.6565), // longe
    ];

    const dentro = ocorrenciasNoRaio(lista, ORIGEM, 1000);

    expect(dentro).toHaveLength(1);
    expect(dentro[0]!.severidade).toBe('baixo');
  });
});
