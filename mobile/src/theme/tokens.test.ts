import tokensV6 from '../../../mobile-design/docs/v6/tokens.v6.json';

import { cores, espaco, escalaFonte, movimento, severidade, texto } from './tokens';

describe('tokens v6', () => {
  it('transcreve a paleta escura', () => {
    expect(cores.escuro.background).toBe(tokensV6.color.dark.background);
    expect(cores.escuro.surface).toBe(tokensV6.color.dark.surface);
    expect(cores.escuro.textPrimary).toBe(tokensV6.color.dark.textPrimary);
    expect(cores.escuro.line).toBe(tokensV6.color.dark.line);
  });

  it('mapeia a severidade do design para o domínio', () => {
    expect(severidade.claro.fill.critico).toBe(tokensV6.severity.light.fill.critical);
    expect(severidade.claro.meter.alto).toBe(tokensV6.severity.light.meter.high);
    expect(severidade.escuro.text.moderado).toBe(tokensV6.severity.dark.text.moderate);
    expect(severidade.escuro.fill.baixo).toBe(tokensV6.severity.dark.fill.low);
  });

  it('transcreve a tipografia hero', () => {
    const hero = tokensV6.typography.styles.hero;
    expect(texto.hero).toEqual({
      familia: hero.family,
      tamanho: hero.size,
      alturaLinha: hero.lineHeight,
      peso: hero.weight,
      espacamento: hero.letterSpacing,
    });
  });

  it('usa o gutter da tela e os limites de escala de fonte', () => {
    expect(espaco.gutter).toBe(tokensV6.space.screenGutter);
    expect(escalaFonte.cromoMax).toBe(tokensV6.typography.fontScale.chromeMax);
    expect(escalaFonte.heroiMax).toBe(tokensV6.typography.fontScale.heroMax);
  });

  it('transcreve os valores de movimento', () => {
    expect(movimento.curvas.out).toEqual(tokensV6.motion.easing.out);
    expect(movimento.curvas.sheet).toEqual(tokensV6.motion.easing.sheet);
    expect(movimento.curvas.spring).toEqual(tokensV6.motion.easing.spring);
    expect(movimento.curvas.exit).toEqual(tokensV6.motion.easing.exit);
    expect(movimento.pressao).toEqual({ escala: 0.97, ms: 120 });
    expect(movimento.entrada).toEqual({ deslocamentoY: 10, ms: 560, escalonamento: 55 });
    expect(movimento.skeleton).toEqual({ opacidadeMin: 0.55, ms: 1200 });
    expect(movimento.tema.ms).toBe(350);
  });
});
