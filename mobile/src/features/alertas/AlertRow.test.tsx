import { fireEvent, render } from '@testing-library/react-native';

import type { Ocorrencia } from '@/domain/tipos';
import { TemaProvider } from '@/theme/tema';

import { AlertRow } from './AlertRow';
import type { ItemAlerta } from './regras';

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
  id: 7,
  tipo: 'alagamento',
  severidade: 'critico',
  latitude: -23.5613,
  longitude: -46.6565,
  geohash: '6gycfq',
  confirmacoes: 3,
  status: 'ativa',
  criada_em: '2026-11-07T14:00:00-03:00',
  atualizada_em: '2026-11-07T14:00:00-03:00',
  expira_em: '2026-11-08T14:00:00-03:00',
};

const ITEM: ItemAlerta = {
  chave: '7:critico',
  ocorrencia: OCORRENCIA,
  distanciaM: 760,
  recebidoEm: '2026-11-07T14:32:00-03:00',
  lido: false,
};

function montar(onPress: () => void) {
  return render(
    <TemaProvider inicial="escuro">
      <AlertRow item={ITEM} tempo="há 5 min" onPress={onPress} />
    </TemaProvider>,
  );
}

describe('AlertRow', () => {
  it('mostra tipo, distância, tempo, hora e severidade', async () => {
    const { getByText } = await montar(jest.fn());

    expect(getByText('Alagamento')).toBeTruthy();
    expect(getByText('760 m · há 5 min')).toBeTruthy();
    expect(getByText('14:32')).toBeTruthy();
  });

  it('expõe o rótulo acessível com tipo, severidade, distância e tempo', async () => {
    const { getByLabelText } = await montar(jest.fn());

    expect(getByLabelText('Alagamento, Crítico, 760 m, há 5 min')).toBeTruthy();
  });

  it('chama onPress ao tocar', async () => {
    const onPress = jest.fn();
    const { getByLabelText } = await montar(onPress);

    await fireEvent.press(getByLabelText('Alagamento, Crítico, 760 m, há 5 min'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
