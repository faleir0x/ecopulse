import type { Ocorrencia } from '@/domain/tipos';

import {
  acrescentar,
  avaliar,
  avisarZona,
  JANELA_REPETICAO_ZONA_MS,
  MAX_ALERTAS,
  respostaNova,
  type Contexto,
  type ItemAlerta,
} from './regras';

const PAULISTA = { latitude: -23.5613, longitude: -46.6565 };
const AGORA = new Date('2026-11-08T12:00:00Z');

function ocorrencia(extra: Partial<Ocorrencia> = {}): Ocorrencia {
  return {
    id: 1,
    tipo: 'alagamento',
    severidade: 'alto',
    latitude: -23.5603, // ~110 m ao norte
    longitude: -46.6565,
    geohash: '6gycfq',
    confirmacoes: 1,
    status: 'ativa',
    criada_em: AGORA.toISOString(),
    atualizada_em: AGORA.toISOString(),
    expira_em: AGORA.toISOString(),
    ...extra,
  };
}

const ctx = (extra: Partial<Contexto> = {}): Contexto => ({
  posicao: PAULISTA,
  raioM: 1000,
  limiar: 'moderado',
  tiposAtivos: ['alagamento', 'calor', 'qualidade_ar', 'rota_obstruida'],
  jaAlertada: new Map(),
  ...extra,
});

describe('avaliar', () => {
  it('alerta ocorrência nova dentro do raio e acima do limiar', () => {
    const item = avaliar({ type: 'ocorrencia.criada', ocorrencia: ocorrencia() }, ctx(), AGORA);
    expect(item?.chave).toBe('1:alto');
    expect(item?.distanciaM).toBeGreaterThan(100);
    expect(item?.lido).toBe(false);
  });

  it('ignora abaixo do limiar, fora do raio, tipo desligado e expirada', () => {
    expect(
      avaliar(
        { type: 'ocorrencia.criada', ocorrencia: ocorrencia({ severidade: 'baixo' }) },
        ctx(),
        AGORA,
      ),
    ).toBeNull();
    expect(
      avaliar(
        { type: 'ocorrencia.criada', ocorrencia: ocorrencia({ latitude: -23.58 }) },
        ctx(),
        AGORA,
      ),
    ).toBeNull();
    expect(
      avaliar(
        { type: 'ocorrencia.criada', ocorrencia: ocorrencia() },
        ctx({ tiposAtivos: ['calor'] }),
        AGORA,
      ),
    ).toBeNull();
    expect(
      avaliar({ type: 'ocorrencia.expirada', ocorrencia: ocorrencia() }, ctx(), AGORA),
    ).toBeNull();
  });

  it('sem posição não alerta', () => {
    expect(
      avaliar(
        { type: 'ocorrencia.criada', ocorrencia: ocorrencia() },
        ctx({ posicao: null }),
        AGORA,
      ),
    ).toBeNull();
  });

  it('confirmações não repetem o alerta; piorar alerta de novo', () => {
    const jaAlertada = new Map([[1, 'alto' as const]]);
    expect(
      avaliar(
        { type: 'ocorrencia.atualizada', ocorrencia: ocorrencia() },
        ctx({ jaAlertada }),
        AGORA,
      ),
    ).toBeNull();
    const pior = avaliar(
      { type: 'ocorrencia.atualizada', ocorrencia: ocorrencia({ severidade: 'critico' }) },
      ctx({ jaAlertada }),
      AGORA,
    );
    expect(pior?.chave).toBe('1:critico');
  });
});

describe('acrescentar', () => {
  it('põe no topo, sem duplicar e respeitando o limite', () => {
    const base = avaliar({ type: 'ocorrencia.criada', ocorrencia: ocorrencia() }, ctx(), AGORA)!;
    let lista = acrescentar([], base);
    lista = acrescentar(lista, { ...base });
    expect(lista).toHaveLength(1);
    for (let i = 2; i < MAX_ALERTAS + 10; i++)
      lista = acrescentar(lista, { ...base, chave: `${i}:alto` });
    expect(lista).toHaveLength(MAX_ALERTAS);
    expect(lista[0]?.chave).toBe(`${MAX_ALERTAS + 9}:alto`);
  });
});

function alerta(id: number, recebidoEm: string): ItemAlerta {
  return {
    chave: `${id}:alto:${recebidoEm}`,
    ocorrencia: ocorrencia({ id }),
    distanciaM: 50,
    recebidoEm,
    lido: false,
  };
}

describe('avisarZona', () => {
  const dentroDaJanela = new Date(AGORA.getTime() - JANELA_REPETICAO_ZONA_MS + 1).toISOString();

  it('não avisa de novo dentro da janela', () => {
    expect(avisarZona(1, [alerta(1, dentroDaJanela)], AGORA)).toBe(false);
  });

  it('avisa de novo fora da janela', () => {
    const foraDaJanela = new Date(AGORA.getTime() - JANELA_REPETICAO_ZONA_MS).toISOString();
    expect(avisarZona(1, [alerta(1, foraDaJanela)], AGORA)).toBe(true);
  });

  it('outra ocorrência não bloqueia o aviso', () => {
    expect(avisarZona(2, [alerta(1, dentroDaJanela)], AGORA)).toBe(true);
  });

  it('sem alertas avisa', () => {
    expect(avisarZona(1, [], AGORA)).toBe(true);
  });
});

describe('respostaNova', () => {
  it('ignora a mesma resposta já tratada', () => {
    expect(respostaNova('notificacao:acao', 'notificacao:acao')).toBe(false);
  });

  it('trata uma resposta diferente', () => {
    expect(respostaNova('notificacao:acao', 'outra:acao')).toBe(true);
  });

  it('trata quando ainda não há última resposta', () => {
    expect(respostaNova('notificacao:acao', null)).toBe(true);
  });
});
