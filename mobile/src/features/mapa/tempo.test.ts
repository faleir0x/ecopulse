import { horaMinuto, tempoRelativo } from './tempo';

const AGORA = new Date('2026-11-07T15:00:00-03:00');

describe('tempoRelativo', () => {
  it('diz "agora" para menos de um minuto', () => {
    expect(tempoRelativo('2026-11-07T14:59:40-03:00', AGORA)).toBe('agora');
  });

  it('diz "há 5 min" para minutos', () => {
    expect(tempoRelativo('2026-11-07T14:55:00-03:00', AGORA)).toBe('há 5 min');
  });

  it('diz "há 2 h" para horas', () => {
    expect(tempoRelativo('2026-11-07T13:00:00-03:00', AGORA)).toBe('há 2 h');
  });

  it('diz "há 3 dias" para dias', () => {
    expect(tempoRelativo('2026-11-04T15:00:00-03:00', AGORA)).toBe('há 3 dias');
  });

  it('diz "há 1 dia" no singular', () => {
    expect(tempoRelativo('2026-11-06T15:00:00-03:00', AGORA)).toBe('há 1 dia');
  });

  it('não estoura com data inválida', () => {
    expect(tempoRelativo('não é data', AGORA)).toBe('agora');
  });
});

describe('horaMinuto', () => {
  it('formata com zero à esquerda', () => {
    expect(horaMinuto('2026-11-07T12:08:00-03:00')).toBe('12:08');
  });

  it('formata meia-noite', () => {
    expect(horaMinuto('2026-11-07T00:05:00-03:00')).toBe('00:05');
  });
});
