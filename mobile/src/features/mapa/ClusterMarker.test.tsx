import { render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { Ocorrencia } from '@/domain/tipos';
import { TemaProvider } from '@/theme/tema';

import type { Grupo } from './agrupar';
import { ClusterMarker } from './ClusterMarker';

jest.mock('react-native-maps', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');

  return {
    Marker: ({ children, accessibilityLabel }: { children?: ReactNode; accessibilityLabel?: string }) =>
      React.createElement(View, { accessible: true, accessibilityLabel }, children),
  };
});

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

function ocorrencia(id: number): Ocorrencia {
  return {
    id,
    tipo: 'alagamento',
    severidade: 'alto',
    latitude: -23.5613,
    longitude: -46.6565,
    geohash: '6gyf4',
    confirmacoes: 0,
    status: 'ativa',
    criada_em: '2026-11-08T12:00:00Z',
    atualizada_em: '2026-11-08T12:00:00Z',
    expira_em: '2026-11-08T13:00:00Z',
  };
}

const GRUPO: Grupo = {
  chave: '1-2',
  ocorrencias: [ocorrencia(1), ocorrencia(2)],
  latitude: -23.5614,
  longitude: -46.6566,
  pior: 'critico',
};

describe('ClusterMarker', () => {
  it('mostra a quantidade no centro', async () => {
    const { getByText } = await render(
      <TemaProvider inicial="escuro">
        <ClusterMarker grupo={GRUPO} onPress={jest.fn()} />
      </TemaProvider>,
    );

    expect(getByText('2')).toBeTruthy();
  });

  it('expõe rótulo acessível "N ocorrências"', async () => {
    const { getByLabelText } = await render(
      <TemaProvider inicial="escuro">
        <ClusterMarker grupo={GRUPO} onPress={jest.fn()} />
      </TemaProvider>,
    );

    expect(getByLabelText('2 ocorrências')).toBeTruthy();
  });
});
