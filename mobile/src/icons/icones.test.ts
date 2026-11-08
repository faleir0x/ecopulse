import { ICONES, VARIANTES_EXTRAS } from './index';
import { ICONES_SVG } from './solar/icones';

describe('ícones Solar gerados', () => {
  it('gera a variante linear de cada ícone', () => {
    for (const nome of ICONES) {
      const chave = `${nome}-linear`;
      const svg = ICONES_SVG[chave];
      expect(svg).toBeDefined();
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('currentColor');
    }
  });

  it('gera todas as variantes extras', () => {
    for (const chave of VARIANTES_EXTRAS) {
      const svg = ICONES_SVG[chave];
      expect(svg).toBeDefined();
      expect(svg).toContain('viewBox="0 0 24 24"');
      expect(svg).toContain('currentColor');
    }
  });
});
