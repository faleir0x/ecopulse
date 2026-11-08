import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { buscarSituacaoRelato } from '@/api/cliente';
import type { RelatoLocal } from '@/data/outbox';
import { TemaProvider } from '@/theme/tema';

import { TelaMeusRelatos } from './TelaMeusRelatos';

jest.mock('@/api/cliente', () => ({
  buscarSituacaoRelato: jest.fn(),
}));

let mockMeus: RelatoLocal[] = [];
const mockEncerrar = jest.fn();
const mockSetRelatarAberto = jest.fn();
const mockSetOcorrenciaFoco = jest.fn();
const mockBuscar = buscarSituacaoRelato as jest.Mock;

jest.mock('@/state/relatos', () => ({
  useRelatos: () => ({ meus: mockMeus, encerrar: mockEncerrar }),
}));

jest.mock('@/state/ui', () => ({
  useUi: () => ({
    setRelatarAberto: mockSetRelatarAberto,
    setOcorrenciaFoco: mockSetOcorrenciaFoco,
  }),
}));

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), navigate: jest.fn(), canGoBack: () => true, replace: jest.fn() },
}));

const mockNavigate = router.navigate as jest.Mock;

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
    tipo: 'alagamento',
    severidade: 'alto',
    descricao: null,
    latitude: -23.5613,
    longitude: -46.6565,
    registrado_em: '2026-11-08T12:00:00-03:00',
    status,
    tentativas: 0,
    proxima_tentativa_em: null,
    ultimo_erro: null,
    midias: [],
    criado_em: Date.parse('2026-11-08T12:00:00-03:00'),
    // Enviado há 30 s: ainda dentro da janela de processamento
    enviado_em: status === 'enviado' ? Date.now() - 30_000 : null,
  };
}

function montar() {
  const clienteQuery = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={clienteQuery}>
      <SafeAreaProvider initialMetrics={METRICAS}>
        <TemaProvider inicial="escuro">
          <TelaMeusRelatos />
        </TemaProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockMeus = [];
  mockBuscar.mockReset();
  mockEncerrar.mockClear();
  mockSetRelatarAberto.mockClear();
  mockSetOcorrenciaFoco.mockClear();
  mockNavigate.mockClear();
});

describe('TelaMeusRelatos · situação no servidor', () => {
  it('mostra confirmações e abre o detalhe da ocorrência no Mapa', async () => {
    mockBuscar.mockResolvedValue({
      client_id: 'enviado-1',
      ocorrencia_id: 42,
      status_ocorrencia: 'ativa',
      confirmacoes: 3,
    });
    mockMeus = [relato('enviado', 'enviado-1')];

    const { findByText, getByText } = await montar();

    expect(await findByText('3 confirmações')).toBeTruthy();

    await fireEvent.press(getByText('Enviado'));
    expect(mockSetOcorrenciaFoco).toHaveBeenCalledWith(42);
    expect(mockNavigate).toHaveBeenCalledWith('/mapa');
  });

  it('mostra "Processando…" e não navega enquanto o processor não gravou', async () => {
    mockBuscar.mockResolvedValue(null);
    mockMeus = [relato('enviado', 'enviado-1')];

    const { findByText } = await montar();

    const texto = await findByText('Processando…');
    await fireEvent.press(texto);

    expect(mockSetOcorrenciaFoco).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('ocorrência expirada mostra "Encerrado" e não navega', async () => {
    mockBuscar.mockResolvedValue({
      client_id: 'enviado-1',
      ocorrencia_id: 43,
      status_ocorrencia: 'expirada',
      confirmacoes: 2,
    });
    mockMeus = [relato('enviado', 'enviado-1')];

    const { findByText } = await montar();

    const texto = await findByText('Encerrado');
    await fireEvent.press(texto);

    expect(mockSetOcorrenciaFoco).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('relato na fila não consulta o servidor nem navega', async () => {
    mockMeus = [relato('pendente', 'pendente-1')];

    const { getByText } = await montar();

    await waitFor(() => expect(mockBuscar).not.toHaveBeenCalled());
    expect(getByText('Na fila')).toBeTruthy();

    await fireEvent.press(getByText('Na fila'));
    expect(mockSetOcorrenciaFoco).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
