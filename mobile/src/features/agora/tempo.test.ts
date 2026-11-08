import { condicao } from './tempo';

describe('condicao', () => {
  it('traduz os códigos WMO principais', () => {
    expect(condicao(0)).toEqual({ texto: 'Ensolarado', icone: 'sun-2' });
    expect(condicao(0, true).icone).toBe('moon');
    expect(condicao(2).texto).toBe('Parcialmente nublado');
    expect(condicao(3).texto).toBe('Nublado');
    expect(condicao(61).texto).toBe('Chuva');
    expect(condicao(81).icone).toBe('cloud-rain');
    expect(condicao(95).texto).toBe('Tempestade');
  });

  it('sem código = sem leitura', () => {
    expect(condicao(null).texto).toBe('Sem leitura');
  });
});
