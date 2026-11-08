import type { Ocorrencia, Severidade } from '@/domain/tipos';

import { agrupar } from './agrupar';

const REGIAO = {
  latitude: -23.5613,
  longitude: -46.6565,
  latitudeDelta: 0.02,
  longitudeDelta: 0.02,
};

const LARGURA = 390;

function ocorrencia(
  id: number,
  latitude: number,
  longitude: number,
  severidade: Severidade = 'moderado',
): Ocorrencia {
  return {
    id,
    tipo: 'alagamento',
    severidade,
    latitude,
    longitude,
    geohash: '6gyf4',
    confirmacoes: 0,
    status: 'ativa',
    criada_em: '2026-11-08T12:00:00Z',
    atualizada_em: '2026-11-08T12:00:00Z',
    expira_em: '2026-11-08T13:00:00Z',
  };
}

const PROXIMA_A = ocorrencia(1, -23.5613, -46.6565);
const PROXIMA_B = ocorrencia(2, -23.5615, -46.6567);
const PROXIMA_C = ocorrencia(3, -23.5614, -46.6566);

describe('agrupar', () => {
  it('junta dois pontos muito próximos em um grupo', () => {
    const { soltos, grupos } = agrupar([PROXIMA_A, PROXIMA_B], REGIAO, LARGURA, new Set());

    expect(soltos).toHaveLength(0);
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.ocorrencias).toHaveLength(2);
    expect(grupos[0]?.chave).toBe('1-2');
    expect(grupos[0]?.latitude).toBeCloseTo(-23.5614);
    expect(grupos[0]?.longitude).toBeCloseTo(-46.6566);
  });

  it('junta pontos colados mesmo dos dois lados de um múltiplo da célula', () => {
    // 56 dp nesta região ≈ 0,00287° de longitude; a linha k·tam fica entre os dois pontos
    const tam = (REGIAO.longitudeDelta / LARGURA) * 56;
    const linha = Math.round(-46.6565 / tam) * tam;
    const a = ocorrencia(10, -23.5613, linha - 0.00001);
    const b = ocorrencia(11, -23.5613, linha + 0.00001);

    const { grupos, soltos } = agrupar([a, b], REGIAO, LARGURA, new Set());

    expect(soltos).toEqual([]);
    expect(grupos).toHaveLength(1);
  });

  it('deixa soltos os pontos distantes', () => {
    const distante = ocorrencia(2, -23.58, -46.68);

    const { soltos, grupos } = agrupar([PROXIMA_A, distante], REGIAO, LARGURA, new Set());

    expect(grupos).toHaveLength(0);
    expect(soltos.map((o) => o.id)).toEqual([1, 2]);
  });

  it('usa a pior severidade do grupo', () => {
    const a = ocorrencia(1, -23.5613, -46.6565, 'baixo');
    const b = ocorrencia(2, -23.5615, -46.6567, 'critico');
    const c = ocorrencia(3, -23.5614, -46.6566, 'alto');

    const { grupos } = agrupar([a, b, c], REGIAO, LARGURA, new Set());

    expect(grupos[0]?.pior).toBe('critico');
  });

  it('nunca agrupa ids fixos (ocorrência selecionada)', () => {
    const { soltos, grupos } = agrupar(
      [PROXIMA_A, PROXIMA_B],
      REGIAO,
      LARGURA,
      new Set([1]),
    );

    expect(grupos).toHaveLength(0);
    expect(soltos.map((o) => o.id)).toEqual([1, 2]);
  });

  it('não agrupa no zoom de rua', () => {
    const regiaoRua = { ...REGIAO, latitudeDelta: 0.003, longitudeDelta: 0.003 };

    const { soltos, grupos } = agrupar([PROXIMA_A, PROXIMA_B], regiaoRua, LARGURA, new Set());

    expect(grupos).toHaveLength(0);
    expect(soltos.map((o) => o.id)).toEqual([1, 2]);
  });

  it('mantém a chave estável independentemente da ordem de entrada', () => {
    const primeiro = agrupar([PROXIMA_A, PROXIMA_B, PROXIMA_C], REGIAO, LARGURA, new Set());
    const segundo = agrupar([PROXIMA_C, PROXIMA_A, PROXIMA_B], REGIAO, LARGURA, new Set());

    expect(primeiro.grupos[0]?.chave).toBe('1-2-3');
    expect(segundo.grupos[0]?.chave).toBe('1-2-3');
  });
});
