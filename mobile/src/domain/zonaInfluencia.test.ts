import { RAIO_INFLUENCIA_MAX_M, RAIO_INFLUENCIA_M } from './zonaInfluencia';

describe('RAIO_INFLUENCIA_M', () => {
  it('cresce com a severidade, e o máximo é o raio do crítico', () => {
    const { baixo, moderado, alto, critico } = RAIO_INFLUENCIA_M;
    expect(baixo).toBeLessThan(moderado);
    expect(moderado).toBeLessThan(alto);
    expect(alto).toBeLessThan(critico);
    expect(RAIO_INFLUENCIA_MAX_M).toBe(critico);
  });
});
