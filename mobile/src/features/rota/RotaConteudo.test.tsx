import { fireEvent, render } from '@testing-library/react-native';

import type { OcorrenciaRota, RotaSegura } from '@/domain/tipos';
import { TemaProvider } from '@/theme/tema';

import { RotaConteudo } from './RotaConteudo';
import type { RotaSeguraEstado } from './useRotaSegura';

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: jest.fn(() => null), setItemSync: jest.fn() },
}));

jest.mock('expo-location', () => ({
  reverseGeocodeAsync: jest.fn(async () => []),
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

const ORIGEM = { latitude: -23.56, longitude: -46.65 };
const DESTINO = { latitude: -23.57, longitude: -46.66 };

const ALAGAMENTO: OcorrenciaRota = {
  id: 1,
  tipo: 'alagamento',
  severidade: 'critico',
  latitude: -23.565,
  longitude: -46.655,
};

function criarRota(overrides: Partial<RotaSegura> = {}): RotaSegura {
  return {
    modo: 'pedestre',
    distancia_m: 1400,
    duracao_s: 840,
    coordenadas: [
      [-23.56, -46.65],
      [-23.565, -46.655],
      [-23.57, -46.66],
    ],
    evitadas: [ALAGAMENTO],
    no_caminho: [],
    sem_desvio: false,
    direta: {
      distancia_m: 1100,
      duracao_s: 660,
      coordenadas: [
        [-23.56, -46.65],
        [-23.57, -46.66],
      ],
      atravessa: [1],
    },
    aviso: null,
    ...overrides,
  };
}

function criarEstado(overrides: Partial<RotaSeguraEstado> = {}): RotaSeguraEstado {
  return {
    fase: 'destino',
    destino: null,
    modo: 'pedestre',
    rota: null,
    calculando: false,
    erro: null,
    setDestino: jest.fn(),
    setModo: jest.fn(),
    calcular: jest.fn(),
    seguir: jest.fn(),
    voltar: jest.fn(),
    limpar: jest.fn(),
    ...overrides,
  };
}

function montar(estado: RotaSeguraEstado, onSair = jest.fn()) {
  return render(
    <TemaProvider inicial="escuro">
      <RotaConteudo estado={estado} origem={ORIGEM} onSair={onSair} />
    </TemaProvider>,
  );
}

describe('RotaConteudo', () => {
  it('mostra o convite e os modos sem destino', async () => {
    const { getByText, getByLabelText } = await montar(criarEstado());

    expect(getByText('Toque no mapa')).toBeTruthy();
    expect(getByLabelText('A pé')).toBeTruthy();
    expect(getByLabelText('Carro')).toBeTruthy();
  });

  it('mostra o resumo da rota com desvio', async () => {
    const { getByText } = await montar(
      criarEstado({ fase: 'resultado', destino: DESTINO, rota: criarRota() }),
    );

    expect(getByText('14 min')).toBeTruthy();
    expect(getByText('Desvia de 1 risco · +3 min')).toBeTruthy();
    expect(getByText('Alagamento')).toBeTruthy();
    expect(getByText('Segura')).toBeTruthy();
    expect(getByText('Direta')).toBeTruthy();
  });

  it('mostra o aviso quando não há desvio possível', async () => {
    const { getByText } = await montar(
      criarEstado({
        fase: 'resultado',
        destino: DESTINO,
        rota: criarRota({ sem_desvio: true, evitadas: [], no_caminho: [ALAGAMENTO] }),
      }),
    );

    expect(getByText('Sem desvio possível')).toBeTruthy();
  });

  it('não diz "sem riscos" quando a rota ainda cruza uma zona', async () => {
    const { getByText, queryByText } = await montar(
      criarEstado({
        fase: 'resultado',
        destino: DESTINO,
        rota: criarRota({ evitadas: [], no_caminho: [ALAGAMENTO], direta: null }),
      }),
    );

    expect(getByText('1 risco no caminho')).toBeTruthy();
    expect(queryByText('Sem riscos no caminho')).toBeNull();
    expect(queryByText('No caminho')).toBeNull();
  });

  it('volta para a saída na fase destino e para o estado nas demais', async () => {
    const sair = jest.fn();
    const voltar = jest.fn();
    const destino = criarEstado({ voltar });
    const primeira = await montar(destino, sair);

    await fireEvent.press(primeira.getByLabelText('Voltar'));
    expect(sair).toHaveBeenCalledTimes(1);
    expect(voltar).not.toHaveBeenCalled();

    const resultado = criarEstado({
      fase: 'resultado',
      destino: DESTINO,
      rota: criarRota(),
      voltar,
    });
    const segunda = await montar(resultado, sair);

    await fireEvent.press(segunda.getByLabelText('Voltar'));
    expect(voltar).toHaveBeenCalledTimes(1);
    expect(sair).toHaveBeenCalledTimes(1);
  });
});
