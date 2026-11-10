import type { Ocorrencia, TipoRisco } from '@/domain/tipos';

import {
  aoAvaliarZonas,
  aoReceberEvento,
  type EstadoAlertas,
  type Preferencias,
} from './motor';
import { JANELA_REPETICAO_ZONA_MS, type ItemAlerta } from './regras';

const BASE = { latitude: -23.5613, longitude: -46.6565 };
const AGORA = new Date('2026-11-08T12:00:00Z');
const TIPOS: TipoRisco[] = ['alagamento', 'calor', 'qualidade_ar', 'rota_obstruida'];

/** Ocorrência a `metros` ao norte de BASE. */
function ocorrencia(id = 1, metros = 110, extra: Partial<Ocorrencia> = {}): Ocorrencia {
  return {
    id,
    tipo: 'alagamento',
    severidade: 'alto',
    latitude: BASE.latitude + metros / 111_320,
    longitude: BASE.longitude,
    geohash: '6gycfq',
    confirmacoes: 1,
    status: 'ativa',
    criada_em: AGORA.toISOString(),
    atualizada_em: AGORA.toISOString(),
    expira_em: AGORA.toISOString(),
    ...extra,
  };
}

function alerta(
  o: Ocorrencia,
  recebidoEm = AGORA.toISOString(),
  origem: 'evento' | 'zona' = 'evento',
): ItemAlerta {
  return {
    chave: origem === 'zona' ? `zona:${o.id}:${recebidoEm}` : `${o.id}:${o.severidade}`,
    ocorrencia: o,
    distanciaM: 50,
    recebidoEm,
    lido: false,
  };
}

function prefs(extra: Partial<Preferencias> = {}): Preferencias {
  return { posicao: BASE, raioM: 1000, limiar: 'moderado', tiposAtivos: TIPOS, ...extra };
}

function estado(extra: Partial<EstadoAlertas> = {}): EstadoAlertas {
  return { alertas: [], zonas: new Set(), zonasIniciadas: true, ...extra };
}

describe('aoReceberEvento', () => {
  it('avisa na primeira vez dentro do raio e acima do limiar', () => {
    const resultado = aoReceberEvento(
      estado(),
      { type: 'ocorrencia.criada', ocorrencia: ocorrencia() },
      prefs(),
      AGORA,
    );
    expect(resultado.avisos).toHaveLength(1);
    expect(resultado.avisos[0]?.origem).toBe('evento');
    expect(resultado.avisos[0]?.item.chave).toBe('1:alto');
    expect(resultado.estado.alertas[0]?.chave).toBe('1:alto');
  });

  it('não avisa para tipo desativado', () => {
    const resultado = aoReceberEvento(
      estado(),
      { type: 'ocorrencia.criada', ocorrencia: ocorrencia() },
      prefs({ tiposAtivos: ['calor'] }),
      AGORA,
    );
    expect(resultado.avisos).toEqual([]);
    expect(resultado.estado.alertas).toEqual([]);
  });

  it('não avisa abaixo do limiar', () => {
    const resultado = aoReceberEvento(
      estado(),
      { type: 'ocorrencia.criada', ocorrencia: ocorrencia(1, 110, { severidade: 'baixo' }) },
      prefs(),
      AGORA,
    );
    expect(resultado.avisos).toEqual([]);
  });

  it('não avisa fora do raio', () => {
    const resultado = aoReceberEvento(
      estado(),
      { type: 'ocorrencia.criada', ocorrencia: ocorrencia(1, 5_000) },
      prefs(),
      AGORA,
    );
    expect(resultado.avisos).toEqual([]);
  });

  it('não repete a mesma severidade já alertada', () => {
    const o = ocorrencia();
    const resultado = aoReceberEvento(
      estado({ alertas: [alerta(o)] }),
      { type: 'ocorrencia.atualizada', ocorrencia: o },
      prefs(),
      AGORA,
    );
    expect(resultado.avisos).toEqual([]);
  });

  it('avisa de novo quando a severidade piora', () => {
    const o = ocorrencia();
    const pior = ocorrencia(1, 110, { severidade: 'critico' });
    const resultado = aoReceberEvento(
      estado({ alertas: [alerta(o)] }),
      { type: 'ocorrencia.atualizada', ocorrencia: pior },
      prefs(),
      AGORA,
    );
    expect(resultado.avisos[0]?.item.chave).toBe('1:critico');
    expect(resultado.estado.alertas).toHaveLength(2);
  });
});

describe('aoAvaliarZonas', () => {
  it('primeira avaliação semeia em silêncio', () => {
    const resultado = aoAvaliarZonas(
      estado({ zonas: new Set(), zonasIniciadas: false }),
      [ocorrencia(1, 400)],
      prefs(),
      AGORA,
    );
    expect(resultado.avisos).toEqual([]);
    expect(resultado.estado.alertas).toEqual([]);
    expect(resultado.estado.zonas.has(1)).toBe(true);
    expect(resultado.estado.zonasIniciadas).toBe(true);
  });

  it('avisa ao entrar na zona', () => {
    const resultado = aoAvaliarZonas(estado(), [ocorrencia(1, 400)], prefs(), AGORA);
    expect(resultado.avisos).toHaveLength(1);
    expect(resultado.avisos[0]?.origem).toBe('zona');
    expect(resultado.avisos[0]?.item.chave).toBe(`zona:1:${AGORA.getTime()}`);
    expect(resultado.estado.zonas.has(1)).toBe(true);
    expect(resultado.estado.alertas[0]?.chave).toBe(`zona:1:${AGORA.getTime()}`);
  });

  it('não avisa de novo ao entrar na janela de repetição', () => {
    const o = ocorrencia(1, 400);
    const dentroDaJanela = new Date(
      AGORA.getTime() - JANELA_REPETICAO_ZONA_MS + 1,
    ).toISOString();
    const resultado = aoAvaliarZonas(
      estado({ alertas: [alerta(o, dentroDaJanela, 'zona')] }),
      [o],
      prefs(),
      AGORA,
    );
    expect(resultado.avisos).toEqual([]);
    expect(resultado.estado.zonas.has(1)).toBe(true);
  });

  it('saída usa histerese e voltar pode avisar de novo', () => {
    const aindaNaBorda = aoAvaliarZonas(
      estado({ zonas: new Set([1]) }),
      [ocorrencia(1, 550)],
      prefs(),
      AGORA,
    );
    expect(aindaNaBorda.avisos).toEqual([]);
    expect(aindaNaBorda.estado.zonas.has(1)).toBe(true);

    const saiu = aoAvaliarZonas(aindaNaBorda.estado, [ocorrencia(1, 650)], prefs(), AGORA);
    expect(saiu.estado.zonas.has(1)).toBe(false);

    const voltou = aoAvaliarZonas(saiu.estado, [ocorrencia(1, 400)], prefs(), AGORA);
    expect(voltou.avisos).toHaveLength(1);
    expect(voltou.avisos[0]?.item.ocorrencia.id).toBe(1);
  });

  it('sem posição não avalia nem avisa', () => {
    const anterior = estado({ zonas: new Set([1]) });
    const resultado = aoAvaliarZonas(anterior, [ocorrencia(1, 400)], prefs({ posicao: null }), AGORA);
    expect(resultado.avisos).toEqual([]);
    expect(resultado.estado).toBe(anterior);
  });
});

describe('limite da lista', () => {
  it('mantém no máximo MAX_ALERTAS ao acumular avisos de zona', () => {
    const alertas = Array.from({ length: 100 }, (_, i) => {
      const o = ocorrencia(i + 1, 400);
      return alerta(o, AGORA.toISOString(), 'zona');
    });
    // Todas as 100 já estão dentro da janela de repetição: nenhuma entra de novo.
    const resultado = aoAvaliarZonas(
      estado({ alertas }),
      [ocorrencia(101, 400)],
      prefs(),
      AGORA,
    );
    expect(resultado.estado.alertas).toHaveLength(100);
    expect(resultado.avisos).toHaveLength(1);
  });
});
