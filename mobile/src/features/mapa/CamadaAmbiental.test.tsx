import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { CelulaAmbiente } from '@/domain/tipos';
import { TemaProvider } from '@/theme/tema';

import { CamadaAmbiental, useSuperficie } from './CamadaAmbiental';
import type { Camada } from './useCamada';

const overlays: { image: { uri: string }; bounds: unknown }[] = [];
jest.mock('react-native-maps', () => ({
  Overlay: (props: { image: { uri: string }; bounds: unknown }) => {
    overlays.push(props);
    return null;
  },
}));

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

const CELULA: CelulaAmbiente = {
  geohash: '6gyf4',
  lat_min: -23.55,
  lon_min: -46.65,
  lat_max: -23.5,
  lon_max: -46.6,
  temperatura: 24,
  aqi: 35,
  medido_em: '2026-11-08T12:00:00Z',
};

function ComSuperficie({ celulas, camada }: { celulas: CelulaAmbiente[]; camada: Camada }) {
  return <CamadaAmbiental superficie={useSuperficie(celulas, camada)} />;
}

function comTema(filho: ReactNode) {
  return render(<TemaProvider inicial="escuro">{filho}</TemaProvider>);
}

beforeEach(() => {
  overlays.length = 0;
});

describe('CamadaAmbiental', () => {
  it('estica a imagem da superfície sobre as células', async () => {
    await comTema(<ComSuperficie celulas={[CELULA]} camada="calor" />);

    expect(overlays).toHaveLength(1);
    expect(overlays[0]?.image.uri).toMatch(/^data:image\/png;base64,/);
    expect(overlays[0]?.bounds).toEqual([
      [-23.5, -46.6],
      [-23.55, -46.65],
    ]);
  });

  it('não desenha com a camada nenhuma nem sem leitura', async () => {
    await comTema(<ComSuperficie celulas={[CELULA]} camada="nenhuma" />);
    await comTema(<ComSuperficie celulas={[{ ...CELULA, aqi: null }]} camada="ar" />);

    expect(overlays).toHaveLength(0);
  });
});
