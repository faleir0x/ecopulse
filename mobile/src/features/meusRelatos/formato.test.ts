import { formatarCoordenadas } from './formato';

describe('formatarCoordenadas', () => {
  it('formata em pt-BR com quatro casas', () => {
    expect(formatarCoordenadas(-23.5613, -46.6565)).toBe('-23,5613, -46,6565');
  });
});
