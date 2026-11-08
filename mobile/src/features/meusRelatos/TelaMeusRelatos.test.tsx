import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { RelatoLocal } from '@/data/outbox';
import { TemaProvider } from '@/theme/tema';

import { TelaMeusRelatos } from './TelaMeusRelatos';

let mockMeus: RelatoLocal[] = [];
const mockEncerrar = jest.fn();
const mockSetRelatarAberto = jest.fn();

jest.mock('@/state/relatos', () => ({
  useRelatos: () => ({ meus: mockMeus, encerrar: mockEncerrar }),
}));

jest.mock('@/state/ui', () => ({
  useUi: () => ({ setRelatarAberto: mockSetRelatarAberto }),
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn() },
}));

const mockBack = router.back as jest.Mock;

jest.mock('@/features/relatar/MediaViewer', () => ({
  MediaViewer: () => null,
}));

jest.mock('expo-image', () => ({ Image: () => null }));

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

function relato(status: RelatoLocal['status'], clientId: string): RelatoLocal {
  return {
    client_id: clientId,
    device_id: 'aparelho',
    tipo: status === 'rejeitado' ? 'calor' : 'alagamento',
    severidade: 'alto',
    descricao: null,
    latitude: -23.5613,
    longitude: -46.6565,
    registrado_em: '2026-11-08T12:00:00-03:00',
    status,
    tentativas: 0,
    proxima_tentativa_em: null,
    ultimo_erro: status === 'rejeitado' ? 'Dados inválidos' : null,
    midias: [],
    criado_em: Date.parse('2026-11-08T12:00:00-03:00'),
    enviado_em: status === 'enviado' ? Date.parse('2026-11-08T12:01:00-03:00') : null,
  };
}

function montar() {
  return render(
    <SafeAreaProvider initialMetrics={METRICAS}>
      <TemaProvider inicial="escuro">
        <TelaMeusRelatos />
      </TemaProvider>
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  mockMeus = [];
  mockEncerrar.mockClear();
  mockSetRelatarAberto.mockClear();
  mockBack.mockClear();
});

describe('TelaMeusRelatos', () => {
  it('mostra o vazio e abre o relato ao tocar em Relatar', async () => {
    const { getByText, getByLabelText } = await montar();

    expect(getByText('Meus relatos')).toBeTruthy();
    expect(getByText('Nenhum relato ainda')).toBeTruthy();

    await fireEvent.press(getByLabelText('Relatar'));
    expect(mockSetRelatarAberto).toHaveBeenCalledWith(true);
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('mostra um item de cada status e o motivo da rejeição', async () => {
    mockMeus = [
      relato('pendente', 'pendente-1'),
      relato('enviado', 'enviado-1'),
      relato('encerrado', 'encerrado-1'),
      relato('rejeitado', 'rejeitado-1'),
    ];

    const { getByText } = await montar();

    expect(getByText('Na fila')).toBeTruthy();
    expect(getByText('Enviado')).toBeTruthy();
    expect(getByText('Encerrado')).toBeTruthy();
    expect(getByText('Rejeitado')).toBeTruthy();
    expect(getByText('Dados inválidos')).toBeTruthy();
  });

  it('mostra "Já passou" só para pendentes e enviados', async () => {
    mockMeus = [
      relato('pendente', 'pendente-1'),
      relato('enviado', 'enviado-1'),
      relato('encerrado', 'encerrado-1'),
      relato('rejeitado', 'rejeitado-1'),
    ];

    const { getAllByLabelText } = await montar();

    expect(getAllByLabelText('Já passou')).toHaveLength(2);
  });

  it('encerra o relato tocado em "Já passou"', async () => {
    mockMeus = [relato('pendente', 'pendente-1')];

    const { getByLabelText } = await montar();

    await fireEvent.press(getByLabelText('Já passou'));
    expect(mockEncerrar).toHaveBeenCalledWith('pendente-1');
  });
});
