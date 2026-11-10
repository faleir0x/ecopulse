import { render } from '@testing-library/react-native';

import type { LeituraAmbiente } from '@/domain/tipos';
import { TemaProvider } from '@/theme/tema';

import { InversaoCard } from './InversaoCard';

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

const LEITURA: LeituraAmbiente = {
  geohash: '6gyf4',
  latitude: -23.55,
  longitude: -46.65,
  medido_em: '2026-11-10T12:00:00Z',
  fonte: 'open-meteo',
  temperatura: 25,
  sensacao: 26,
  codigo_tempo: 1,
  minima_dia: 18,
  maxima_dia: 28,
  aqi: 40,
  chuva_mm_h: 0,
  proximas_horas: [],
  chuva_3h: [],
};

function montar(leitura: LeituraAmbiente | null) {
  return render(
    <TemaProvider inicial="escuro">
      <InversaoCard leitura={leitura} />
    </TemaProvider>,
  );
}

describe('InversaoCard', () => {
  it('não aparece sem inversão, com delta nulo ou sem leitura', async () => {
    const semInversao = await montar(LEITURA);
    expect(semInversao.queryByText('Inversão térmica')).toBeNull();

    const deltaNulo = await montar({ ...LEITURA, inversao_termica: true, inversao_delta_c: null });
    expect(deltaNulo.queryByText(/mais quente a algumas centenas de metros/)).toBeNull();

    const semLeitura = await montar(null);
    expect(semLeitura.queryByText('Inversão térmica')).toBeNull();
  });

  it('mostra o aviso e o delta formatado com vírgula', async () => {
    const { getByText } = await montar({
      ...LEITURA,
      inversao_termica: true,
      inversao_delta_c: 2.3,
    });

    expect(getByText('Inversão térmica')).toBeTruthy();
    expect(
      getByText(/O ar mais quente acima da cidade prende a poluição perto do chão\./),
    ).toBeTruthy();
    expect(getByText('Ar 2,3 °C mais quente a algumas centenas de metros')).toBeTruthy();
  });
});
