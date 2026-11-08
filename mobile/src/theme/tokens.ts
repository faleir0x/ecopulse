/**
 * Tokens da v6 (Grafite + Red Hat + paleta Quente), transcritos de
 * mobile-design/docs/v6/tokens.v6.json. Não invente valores: tudo vem de lá.
 * As chaves de severidade usam o domínio da API (baixo/moderado/alto/critico).
 */
import type { Severidade } from '@/domain/tipos';

export type Esquema = 'claro' | 'escuro';

export type Paleta = {
  background: string;
  surface: string;
  surfaceMuted: string;
  surfaceStrong: string;
  line: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  ink: string;
  onInk: string;
  accent: string;
  nav: string;
  scrim: string;
  rain: string;
};

export type PaletaSeveridade = {
  fill: Record<Severidade, string>;
  meter: Record<Severidade, string>;
  text: Record<Severidade, string>;
  onFill: string;
  /** No claro o anel do marcador usa o tom `text`; no escuro não há anel. */
  anelMarcador: boolean;
};

export type EstiloTexto = 'caption' | 'body' | 'headline' | 'title' | 'large' | 'number' | 'hero';

export type DefinicaoTexto = {
  familia: 'display' | 'text';
  tamanho: number;
  alturaLinha: number;
  peso: '300' | '400' | '600' | '700';
  espacamento?: number;
};

export type EstiloMapa = {
  land: string;
  park: string;
  water: string;
  roadMinor: string;
  roadTertiary: string;
  roadMid: string;
  roadMajor: string;
  rail: string;
};

export const cores: Record<Esquema, Paleta> = {
  escuro: {
    background: '#0A0A0B',
    surface: '#151517',
    surfaceMuted: '#1E1E21',
    surfaceStrong: '#2A2A2E',
    line: 'rgba(255,255,255,0.07)',
    textPrimary: '#F4F4F2',
    textSecondary: '#A6A6AB',
    textTertiary: '#85858C',
    ink: '#F4F4F2',
    onInk: '#0A0A0B',
    accent: '#7FA2FF',
    nav: '#1C1C1F',
    scrim: 'rgba(0,0,0,0.42)',
    rain: '#60BBDE',
  },
  claro: {
    background: '#F3F3F2',
    surface: '#FFFFFF',
    surfaceMuted: '#EEEEED',
    surfaceStrong: '#E2E2E0',
    line: 'rgba(0,0,0,0.07)',
    textPrimary: '#0B0B0C',
    textSecondary: '#55555B',
    textTertiary: '#6B6B71',
    ink: '#0B0B0C',
    onInk: '#FFFFFF',
    accent: '#2F5BEA',
    nav: '#FFFFFF',
    scrim: 'rgba(0,0,0,0.42)',
    rain: '#138DB1',
  },
};

export const severidade: Record<Esquema, PaletaSeveridade> = {
  escuro: {
    fill: {
      baixo: '#ADA490',
      moderado: '#E6B55D',
      alto: '#F08944',
      critico: '#F75E54',
    },
    meter: {
      baixo: '#ADA490',
      moderado: '#E6B55D',
      alto: '#F08944',
      critico: '#F75E54',
    },
    text: {
      baixo: '#C0B6A2',
      moderado: '#EDBB64',
      alto: '#F69557',
      critico: '#FD7468',
    },
    onFill: '#0B0C0E',
    anelMarcador: false,
  },
  claro: {
    fill: {
      baixo: '#D2C2A4',
      moderado: '#F8C143',
      alto: '#FA8838',
      critico: '#ED413B',
    },
    meter: {
      baixo: '#A59779',
      moderado: '#DD9812',
      alto: '#E16C10',
      critico: '#D9302E',
    },
    text: {
      baixo: '#6B6250',
      moderado: '#965807',
      alto: '#9F440B',
      critico: '#AC191F',
    },
    onFill: '#321F14',
    anelMarcador: true,
  },
};

export const medidor: {
  barras: 4;
  alturas: readonly [number, number, number, number];
  tamanhos: Record<'s' | 'm' | 'l', { h: number; w: number; gap: number }>;
} = {
  barras: 4,
  alturas: [0.4, 0.6, 0.8, 1.0],
  tamanhos: {
    s: { h: 12, w: 3, gap: 2 },
    m: { h: 15, w: 3.5, gap: 2 },
    l: { h: 22, w: 5, gap: 3 },
  },
};

export const marcador: { tamanho: Record<Severidade, number>; areaToque: number; escalaSelecionado: number; proporcaoIcone: number } = {
  tamanho: {
    baixo: 28,
    moderado: 31,
    alto: 34,
    critico: 38,
  },
  areaToque: 44,
  escalaSelecionado: 1.22,
  proporcaoIcone: 0.52,
};

/** Paradas [valor, hex] da escala divergente de temperatura. */
export const escalaTemperatura: { paradas: readonly (readonly [number, string])[]; faixa: readonly [number, number]; capsula: readonly [number, number] } = {
  paradas: [
    [10, '#268BB6'],
    [16, '#6AB0CA'],
    [22, '#CAC4B2'],
    [27, '#E1AD57'],
    [32, '#E27731'],
    [37, '#D33B36'],
  ],
  faixa: [10, 36],
  capsula: [12, 34],
};

export const faixasAqi: Record<Severidade, readonly [number, number]> & { gaugeMax: number; segmentos: number } = {
  baixo: [0, 50],
  moderado: [51, 100],
  alto: [101, 200],
  critico: [201, 500],
  gaugeMax: 300,
  segmentos: 21,
};

export const mapa: Record<Esquema, EstiloMapa> = {
  escuro: {
    land: '#0E0E0F',
    park: '#151515',
    water: '#1C1E21',
    roadMinor: '#1E1E21',
    roadTertiary: '#28282C',
    roadMid: '#313136',
    roadMajor: '#3C3C42',
    rail: '#29292C',
  },
  claro: {
    land: '#EFEFED',
    park: '#E5E6E2',
    water: '#D7DCE1',
    roadMinor: '#F9F9F8',
    roadTertiary: '#FFFFFF',
    roadMid: '#FFFFFF',
    roadMajor: '#FFFFFF',
    rail: '#DCDCDA',
  },
};

export const texto: Record<EstiloTexto, DefinicaoTexto> = {
  caption: { familia: 'text', tamanho: 13, alturaLinha: 18, peso: '400' },
  body: { familia: 'text', tamanho: 15, alturaLinha: 20, peso: '400' },
  headline: { familia: 'text', tamanho: 17, alturaLinha: 22, peso: '600', espacamento: -0.17 },
  title: { familia: 'display', tamanho: 22, alturaLinha: 26, peso: '600', espacamento: -0.44 },
  large: { familia: 'display', tamanho: 30, alturaLinha: 34, peso: '600', espacamento: -0.75 },
  number: { familia: 'display', tamanho: 34, alturaLinha: 34, peso: '300', espacamento: -1.36 },
  hero: { familia: 'display', tamanho: 108, alturaLinha: 97, peso: '300', espacamento: -5.9 },
};

export const escalaFonte = { cromoMax: 1.15, heroiMax: 1.12 } as const;

export const espaco: { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number; gutter: number } = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  gutter: 16,
};

export const raio: { tile: number; chip: number; card: number; sheet: number; reportSheet: number; button: number; pill: number } = {
  tile: 12,
  chip: 16,
  card: 20,
  sheet: 28,
  reportSheet: 40,
  button: 26,
  pill: 999,
};

export const tamanho: { touch: number; button: number; tabBar: number; fab: number; navBottom: number; iconSm: number; icon: number; iconLg: number } = {
  touch: 44,
  button: 52,
  tabBar: 64,
  fab: 64,
  navBottom: 26,
  iconSm: 18,
  icon: 22,
  iconLg: 24,
};

export const sheet: { peek: number; half: number; detail: number; full: number } = {
  peek: 290,
  half: 470,
  detail: 600,
  full: 788,
};

/** Durações (ms) e curvas de motion.presets/easing. */
export const movimento: {
  curvas: Record<'out' | 'sheet' | 'spring' | 'exit', readonly [number, number, number, number]>;
  pressao: { escala: number; ms: number };
  entrada: { deslocamentoY: number; ms: number; escalonamento: number };
  skeleton: { opacidadeMin: number; ms: number };
  tema: { ms: number };
} = {
  curvas: {
    out: [0.22, 1, 0.36, 1],
    sheet: [0.32, 0.72, 0, 1],
    spring: [0.34, 1.36, 0.64, 1],
    exit: [0.4, 0, 1, 1],
  },
  pressao: { escala: 0.97, ms: 120 },
  entrada: { deslocamentoY: 10, ms: 560, escalonamento: 55 },
  skeleton: { opacidadeMin: 0.55, ms: 1200 },
  tema: { ms: 350 },
};
