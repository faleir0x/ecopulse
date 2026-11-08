import { familia } from './fontes';
import { texto } from './tokens';

describe('familia()', () => {
  it('devolve a fonte carregada de cada estilo', () => {
    expect(familia(texto.caption)).toBe('RedHatText_400Regular');
    expect(familia(texto.body)).toBe('RedHatText_400Regular');
    expect(familia(texto.headline)).toBe('RedHatText_600SemiBold');
    expect(familia(texto.title)).toBe('RedHatDisplay_600SemiBold');
    expect(familia(texto.large)).toBe('RedHatDisplay_600SemiBold');
    expect(familia(texto.number)).toBe('RedHatDisplay_300Light');
    expect(familia(texto.hero)).toBe('RedHatDisplay_300Light');
  });

  it('cobre todos os estilos do token', () => {
    for (const def of Object.values(texto)) {
      expect(typeof familia(def)).toBe('string');
    }
  });
});
