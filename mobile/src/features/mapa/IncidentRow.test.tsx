import { fireEvent, render } from '@testing-library/react-native';

import type { Ocorrencia } from '@/domain/tipos';
import { TemaProvider } from '@/theme/tema';

import { IncidentRow } from './IncidentRow';

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

const OCORRENCIA: Ocorrencia = {
  id: 1,
  tipo: 'alagamento',
  severidade: 'critico',
  latitude: -23.5613,
  longitude: -46.6565,
  geohash: '6gyf4',
  confirmacoes: 2,
  status: 'ativa',
  criada_em: '2026-11-07T12:00:00Z',
  atualizada_em: '2026-11-07T12:00:00Z',
  expira_em: '2026-11-08T12:00:00Z',
};

describe('IncidentRow', () => {
  it('mostra tipo, distância, tempo e severidade', async () => {
    const { getByText } = await render(
      <TemaProvider inicial="escuro">
        <IncidentRow ocorrencia={OCORRENCIA} distanciaM={950} tempo="há 5 min" onPress={jest.fn()} />
      </TemaProvider>,
    );

    expect(getByText('Alagamento')).toBeTruthy();
    expect(getByText('950 m · há 5 min')).toBeTruthy();
    expect(getByText('Crítico')).toBeTruthy();
  });

  it('expõe rótulo acessível "tipo, severidade, distância"', async () => {
    const { getByLabelText } = await render(
      <TemaProvider inicial="escuro">
        <IncidentRow ocorrencia={OCORRENCIA} distanciaM={950} tempo="há 5 min" onPress={jest.fn()} />
      </TemaProvider>,
    );

    expect(getByLabelText('Alagamento, Crítico, 950 m')).toBeTruthy();
  });

  it('chama onPress ao tocar', async () => {
    const onPress = jest.fn();
    const { getByLabelText } = await render(
      <TemaProvider inicial="escuro">
        <IncidentRow ocorrencia={OCORRENCIA} distanciaM={950} tempo="há 5 min" onPress={onPress} />
      </TemaProvider>,
    );

    fireEvent.press(getByLabelText('Alagamento, Crítico, 950 m'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
