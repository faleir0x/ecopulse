import { fireEvent, render } from '@testing-library/react-native';

import type { RotaSegura } from '@/domain/tipos';
import { TemaProvider } from '@/theme/tema';

import { RotaRodape } from './RotaRodape';
import type { RotaSeguraEstado } from './useRotaSegura';

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

function criarRota(sem_desvio = false): RotaSegura {
  return {
    modo: 'pedestre',
    distancia_m: 1400,
    duracao_s: 840,
    coordenadas: [
      [-23.56, -46.65],
      [-23.57, -46.66],
    ],
    evitadas: [],
    no_caminho: [],
    sem_desvio,
    direta: null,
    aviso: null,
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
      <RotaRodape estado={estado} onSair={onSair} />
    </TemaProvider>,
  );
}

describe('RotaRodape', () => {
  it('calcula a rota na fase destino', async () => {
    const calcular = jest.fn();
    const estado = criarEstado({ destino: { latitude: -23.57, longitude: -46.66 }, calcular });
    const { getByLabelText } = await montar(estado);

    await fireEvent.press(getByLabelText('Calcular rota'));
    expect(calcular).toHaveBeenCalledTimes(1);
  });

  it('não calcula sem destino', async () => {
    const calcular = jest.fn();
    const { getByLabelText } = await montar(criarEstado({ calcular }));

    await fireEvent.press(getByLabelText('Calcular rota'));
    expect(calcular).not.toHaveBeenCalled();
  });

  it('encerra ou segue quando há desvio', async () => {
    const sair = jest.fn();
    const seguir = jest.fn();
    const { getByLabelText } = await montar(
      criarEstado({ fase: 'resultado', rota: criarRota(), seguir }),
      sair,
    );

    await fireEvent.press(getByLabelText('Encerrar'));
    expect(sair).toHaveBeenCalledTimes(1);

    await fireEvent.press(getByLabelText('Seguir rota'));
    expect(seguir).toHaveBeenCalledTimes(1);
  });

  it('troca o destino ou segue assim quando não há desvio', async () => {
    const setDestino = jest.fn();
    const seguir = jest.fn();
    const { getByLabelText } = await montar(
      criarEstado({ fase: 'resultado', rota: criarRota(true), setDestino, seguir }),
    );

    await fireEvent.press(getByLabelText('Trocar destino'));
    expect(setDestino).toHaveBeenCalledWith(null);

    await fireEvent.press(getByLabelText('Seguir assim'));
    expect(seguir).toHaveBeenCalledTimes(1);
  });

  it('encerra na fase seguindo', async () => {
    const sair = jest.fn();
    const { getByLabelText, queryByText } = await montar(
      criarEstado({ fase: 'seguindo', rota: criarRota() }),
      sair,
    );

    expect(queryByText('Seguir rota')).toBeNull();
    await fireEvent.press(getByLabelText('Encerrar'));
    expect(sair).toHaveBeenCalledTimes(1);
  });
});
