import { SEVERIDADES, TIPOS_RISCO } from '@/domain/tipos';

import { DICAS, dica } from './dicas';

describe('dicas de severidade', () => {
  it('tem uma dica curta para os 4 tipos em todos os 4 níveis', () => {
    for (const tipo of TIPOS_RISCO) {
      for (const severidade of SEVERIDADES) {
        const texto = DICAS[tipo][severidade];
        expect(typeof texto).toBe('string');
        expect(texto.trim().length).toBeGreaterThan(0);
        expect(texto.trim().length).toBeLessThanOrEqual(32);
        expect(dica(tipo, severidade)).toBe(texto);
      }
    }
  });

  it('devolve null sem tipo ou sem nível', () => {
    expect(dica(null, 'alto')).toBeNull();
    expect(dica('alagamento', null)).toBeNull();
  });
});
