import { render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { TemaProvider } from '@/theme/tema';

import { SeverityMeter } from './SeverityMeter';

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

const CORES = {
  apagada: '#2A2A2E',
  baixo: '#ADA490',
  moderado: '#E6B55D',
  alto: '#F08944',
  critico: '#F75E54',
};

describe('SeverityMeter', () => {
  it('acende uma barra para cada nível', async () => {
    const { getAllByTestId } = await render(
      <TemaProvider inicial="escuro">
        <SeverityMeter severidade="alto" animar={false} />
      </TemaProvider>,
    );

    const barras = getAllByTestId(/^barra-severidade-/);
    expect(barras).toHaveLength(4);

    const acesas = barras.filter(
      (barra) => StyleSheet.flatten(barra.props.style).backgroundColor === CORES.alto,
    );
    expect(acesas).toHaveLength(3);
  });

  it('apaga todas as barras quando não há severidade', async () => {
    const { getAllByTestId } = await render(
      <TemaProvider inicial="escuro">
        <SeverityMeter severidade={null} animar={false} />
      </TemaProvider>,
    );

    const barras = getAllByTestId(/^barra-severidade-/);
    for (const barra of barras) {
      expect(StyleSheet.flatten(barra.props.style).backgroundColor).toBe(CORES.apagada);
    }
  });

  it('acende as quatro barras no nível crítico', async () => {
    const { getAllByTestId } = await render(
      <TemaProvider inicial="escuro">
        <SeverityMeter severidade="critico" animar={false} />
      </TemaProvider>,
    );

    const acesas = getAllByTestId(/^barra-severidade-/).filter(
      (barra) =>
        StyleSheet.flatten(barra.props.style).backgroundColor === CORES.critico,
    );
    expect(acesas).toHaveLength(4);
  });

  it('expõe o nível no rótulo acessível', async () => {
    const { getByLabelText } = await render(
      <TemaProvider inicial="escuro">
        <SeverityMeter severidade="alto" />
      </TemaProvider>,
    );

    expect(getByLabelText('Severidade Alta')).toBeTruthy();
  });
});
