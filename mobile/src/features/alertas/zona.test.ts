import type { Ocorrencia } from '@/domain/tipos';

import { avaliarZonas, RAIO_INFLUENCIA_M } from './zona';

const BASE = { latitude: -23.5613, longitude: -46.6565 };
const filtro = { limiar: 'baixo' as const, tiposAtivos: ['alagamento', 'calor', 'qualidade_ar', 'rota_obstruida'] as const };

/** Ocorrência a `metros` ao norte de BASE. */
function o(id: number, metros: number, extra: Partial<Ocorrencia> = {}): Ocorrencia {
  return {
    id,
    tipo: 'alagamento',
    severidade: 'alto',
    latitude: BASE.latitude + metros / 111_320,
    longitude: BASE.longitude,
    geohash: '6gycfq',
    confirmacoes: 1,
    status: 'ativa',
    criada_em: '',
    atualizada_em: '',
    expira_em: '',
    ...extra,
  };
}

const f = { ...filtro, tiposAtivos: [...filtro.tiposAtivos] };

describe('avaliarZonas', () => {
  it('avisa ao entrar e não repete enquanto continua dentro', () => {
    const lista = [o(1, 400)]; // alto: raio 500
    const primeira = avaliarZonas(lista, BASE, new Set(), f);
    expect(primeira.entrou.map((e) => e.ocorrencia.id)).toEqual([1]);
    const segunda = avaliarZonas(lista, BASE, primeira.dentro, f);
    expect(segunda.entrou).toEqual([]);
    expect(segunda.dentro.has(1)).toBe(true);
  });

  it('fora do raio não avisa', () => {
    expect(avaliarZonas([o(1, RAIO_INFLUENCIA_M.alto + 50)], BASE, new Set(), f).entrou).toEqual([]);
  });

  it('histerese: na borda (até 120%) continua dentro; além disso sai e pode avisar de novo', () => {
    const borda = avaliarZonas([o(1, 550)], BASE, new Set([1]), f);
    expect(borda.dentro.has(1)).toBe(true);
    const saiu = avaliarZonas([o(1, 650)], BASE, borda.dentro, f);
    expect(saiu.dentro.has(1)).toBe(false);
    const voltou = avaliarZonas([o(1, 400)], BASE, saiu.dentro, f);
    expect(voltou.entrou).toHaveLength(1);
  });

  it('respeita limiar, tipos ativos e status', () => {
    expect(avaliarZonas([o(1, 50, { severidade: 'baixo' })], BASE, new Set(), { ...f, limiar: 'moderado' }).entrou).toEqual([]);
    expect(avaliarZonas([o(1, 50)], BASE, new Set(), { ...f, tiposAtivos: ['calor'] }).entrou).toEqual([]);
    expect(avaliarZonas([o(1, 50, { status: 'expirada' })], BASE, new Set(), f).entrou).toEqual([]);
  });

  it('crítico avisa de mais longe que baixo', () => {
    const lista = [o(1, 700, { severidade: 'critico' }), o(2, 700, { severidade: 'baixo' })];
    expect(avaliarZonas(lista, BASE, new Set(), f).entrou.map((e) => e.ocorrencia.id)).toEqual([1]);
  });
});
