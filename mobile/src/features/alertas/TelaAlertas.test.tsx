import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Ocorrencia } from '@/domain/tipos';
import { TemaProvider } from '@/theme/tema';

import type { ItemAlerta } from './regras';
import { TelaAlertas } from './TelaAlertas';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn() },
}));

const mockNavigate = router.navigate as jest.Mock;

let mockAlertas: ItemAlerta[] = [];

jest.mock('@/state/alertas', () => ({
  useAlertas: () => ({
    alertas: mockAlertas,
    naoLidos: mockAlertas.filter((alerta) => !alerta.lido).length,
    conexao: 'conectado',
    marcarLido: jest.fn(),
    abrir: jest.fn(),
  }),
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

const METRICAS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const AGORA = new Date().toISOString();

function ocorrencia(id: number): Ocorrencia {
  return {
    id,
    tipo: 'alagamento',
    severidade: 'critico',
    latitude: -23.5613,
    longitude: -46.6565,
    geohash: '6gycfq',
    confirmacoes: 1,
    status: 'ativa',
    criada_em: AGORA,
    atualizada_em: AGORA,
    expira_em: AGORA,
  };
}

function alerta(id: number, lido: boolean): ItemAlerta {
  return {
    chave: `${id}:critico`,
    ocorrencia: ocorrencia(id),
    distanciaM: 760,
    recebidoEm: AGORA,
    lido,
  };
}

function montar() {
  return render(
    <SafeAreaProvider initialMetrics={METRICAS}>
      <TemaProvider inicial="escuro">
        <TelaAlertas />
      </TemaProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockAlertas = [];
  mockNavigate.mockClear();
});

describe('TelaAlertas', () => {
  it('mostra o título e o vazio com ação para ajustar alertas', async () => {
    const { getByText, getByLabelText } = await montar();

    expect(getByText('Alertas')).toBeTruthy();
    expect(getByText('Nenhum alerta')).toBeTruthy();

    await fireEvent.press(getByLabelText('Ajustar alertas'));
    expect(mockNavigate).toHaveBeenCalledWith('/ajustes');
  });

  it('mostra "2 novos" no cabeçalho do grupo com não lidos', async () => {
    mockAlertas = [alerta(1, false), alerta(2, false), alerta(3, true)];

    const { getByText } = await montar();

    expect(getByText('Hoje')).toBeTruthy();
    expect(getByText('2 novos')).toBeTruthy();
  });

  it('não mostra contagem quando o grupo está lido', async () => {
    mockAlertas = [alerta(1, true)];

    const { queryByText } = await montar();

    expect(queryByText('1 novo')).toBeNull();
    expect(queryByText(/novos?$/)).toBeNull();
  });
});
