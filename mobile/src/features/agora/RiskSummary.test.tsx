import { render } from '@testing-library/react-native';
import { PixelRatio } from 'react-native';

import type { Ocorrencia } from '@/domain/tipos';
import { TemaProvider } from '@/theme/tema';

import { piorPorTipo, RiskSummary } from './RiskSummary';

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: jest.fn(() => null), setItemSync: jest.fn() },
}));

jest.mock('react-native-reanimated', () => {
  const { View } = jest.requireActual('react-native');
  const identidade = (valor: unknown) => valor;
  return {
    __esModule: true,
    default: { View },
    useReducedMotion: () => false,
    useAnimatedStyle: (estilo: () => unknown) => estilo(),
    useSharedValue: (inicial: unknown) => ({ value: inicial }),
    withTiming: identidade,
    withSpring: identidade,
    withDelay: (_atraso: number, valor: unknown) => valor,
    withRepeat: identidade,
    Easing: { bezier: () => identidade, inOut: identidade, ease: identidade },
  };
});

const ORIGEM = { latitude: -23.55, longitude: -46.65 };

function ocorrencia(parcial: Partial<Ocorrencia> & Pick<Ocorrencia, 'id' | 'tipo' | 'severidade'>): Ocorrencia {
  return {
    latitude: ORIGEM.latitude,
    longitude: ORIGEM.longitude,
    geohash: '6gyf4',
    confirmacoes: 0,
    status: 'ativa',
    criada_em: '2026-11-08T12:00:00-03:00',
    atualizada_em: '2026-11-08T12:00:00-03:00',
    expira_em: '2026-11-09T12:00:00-03:00',
    ...parcial,
  };
}

const OCORRENCIAS: Ocorrencia[] = [
  ocorrencia({ id: 1, tipo: 'alagamento', severidade: 'critico' }),
  ocorrencia({ id: 2, tipo: 'alagamento', severidade: 'baixo' }),
  ocorrencia({ id: 3, tipo: 'calor', severidade: 'alto', latitude: ORIGEM.latitude + 0.1 }),
  ocorrencia({ id: 4, tipo: 'qualidade_ar', severidade: 'moderado' }),
  ocorrencia({ id: 5, tipo: 'rota_obstruida', severidade: 'alto', status: 'expirada' }),
];

describe('piorPorTipo', () => {
  it('pega o pior nível ativo de cada tipo dentro do raio', () => {
    const piores = piorPorTipo(OCORRENCIAS, ORIGEM, 1000);

    expect(piores.alagamento).toBe('critico');
    expect(piores.qualidade_ar).toBe('moderado');
    expect(piores.calor).toBeNull();
    expect(piores.rota_obstruida).toBeNull();
  });
});

describe('RiskSummary', () => {
  it('mostra o nível de cada tipo e "Sem risco" quando não há', async () => {
    const escala = jest.spyOn(PixelRatio, 'getFontScale').mockReturnValue(1);
    const { getAllByText, getByText } = await render(
      <TemaProvider inicial="escuro">
        <RiskSummary
          ocorrencias={OCORRENCIAS}
          origem={ORIGEM}
          raioM={1000}
          erro={false}
          onTentar={jest.fn()}
          onAbrirMapa={jest.fn()}
        />
      </TemaProvider>,
    );

    expect(getByText('Crítico')).toBeTruthy();
    expect(getByText('Moderado')).toBeTruthy();
    expect(getAllByText('Sem risco')).toHaveLength(2);
    escala.mockRestore();
  });
});

describe('RiskSummary com níveis medidos', () => {
  it('mostra o pior entre o relatado e o medido', async () => {
    const { getByLabelText } = await render(
      <TemaProvider inicial="escuro">
        <RiskSummary
          ocorrencias={[]}
          origem={ORIGEM}
          raioM={1000}
          erro={false}
          onTentar={jest.fn()}
          onAbrirMapa={jest.fn()}
          medido={{ qualidade_ar: 'alto', calor: null }}
        />
      </TemaProvider>,
    );

    expect(getByLabelText('Ar: Alto')).toBeTruthy();
    expect(getByLabelText('Calor: Sem risco')).toBeTruthy();
  });
});
