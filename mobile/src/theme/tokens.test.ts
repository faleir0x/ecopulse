// Valores conferidos com mobile-design/docs/v6/tokens.v6.json (a pasta de design não vai para o Git)
import { cores, espaco, escalaFonte, movimento, severidade, texto } from './tokens';

describe('tokens v6', () => {
  it('transcreve a paleta escura', () => {
    expect(cores.escuro.background).toBe('#0A0A0B');
    expect(cores.escuro.surface).toBe('#151517');
    expect(cores.escuro.textPrimary).toBe('#F4F4F2');
    expect(cores.escuro.line).toBe('rgba(255,255,255,0.07)');
  });

  it('mapeia a severidade do design para o domínio', () => {
    expect(severidade.claro.fill.critico).toBe('#ED413B');
    expect(severidade.claro.meter.alto).toBe('#E16C10');
    expect(severidade.escuro.text.moderado).toBe('#EDBB64');
    expect(severidade.escuro.fill.baixo).toBe('#ADA490');
  });

  it('transcreve a tipografia hero', () => {
    expect(texto.hero).toEqual({
      familia: 'display',
      tamanho: 108,
      alturaLinha: 97,
      peso: '300',
      espacamento: -5.9,
    });
  });

  it('usa o gutter da tela e os limites de escala de fonte', () => {
    expect(espaco.gutter).toBe(16);
    expect(escalaFonte.cromoMax).toBe(1.15);
    expect(escalaFonte.heroiMax).toBe(1.12);
  });

  it('transcreve os valores de movimento', () => {
    expect(movimento.curvas.out).toEqual([0.22, 1, 0.36, 1]);
    expect(movimento.curvas.sheet).toEqual([0.32, 0.72, 0, 1]);
    expect(movimento.curvas.spring).toEqual([0.34, 1.36, 0.64, 1]);
    expect(movimento.curvas.exit).toEqual([0.4, 0, 1, 1]);
    expect(movimento.pressao).toEqual({ escala: 0.97, ms: 120 });
    expect(movimento.entrada).toEqual({ deslocamentoY: 10, ms: 560, escalonamento: 55 });
    expect(movimento.skeleton).toEqual({ opacidadeMin: 0.55, ms: 1200 });
    expect(movimento.tema.ms).toBe(350);
  });
});
