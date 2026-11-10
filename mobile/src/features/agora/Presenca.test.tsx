import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';

import { buscarPresenca } from '@/api/cliente';
import { TemaProvider } from '@/theme/tema';

import { Presenca } from './Presenca';

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

jest.mock('@/api/cliente', () => ({ buscarPresenca: jest.fn() }));

const buscarMock = buscarPresenca as jest.MockedFunction<typeof buscarPresenca>;

const COORDS = { latitude: -23.5505, longitude: -46.6333 };

function montar(aparelhos: number) {
  buscarMock.mockResolvedValue({ aparelhos, janela_min: 15 });
  const cliente = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={cliente}>
      <TemaProvider inicial="escuro">
        <Presenca coords={COORDS} />
      </TemaProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  buscarMock.mockReset();
});

describe('Presenca', () => {
  it('mostra a contagem quando há duas ou mais pessoas', async () => {
    const { getByText } = await montar(5);

    await waitFor(() =>
      expect(getByText('~5 pessoas com o EcoPulse por perto agora')).toBeTruthy(),
    );
  });

  it('mostra que o usuário é o primeiro quando há até uma pessoa', async () => {
    const { getByText } = await montar(1);

    await waitFor(() =>
      expect(getByText('Você é o primeiro com o EcoPulse por aqui agora')).toBeTruthy(),
    );
  });

  it('não renderiza nada enquanto carrega', async () => {
    buscarMock.mockReturnValue(new Promise(() => undefined));
    const cliente = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const { queryByText } = await render(
      <QueryClientProvider client={cliente}>
        <TemaProvider inicial="escuro">
          <Presenca coords={COORDS} />
        </TemaProvider>
      </QueryClientProvider>,
    );

    expect(queryByText(/EcoPulse/)).toBeNull();
  });
});
