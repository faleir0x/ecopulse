import { fireEvent, render } from '@testing-library/react-native';
import type { BottomTabBarProps } from 'expo-router/tabs';

import { TemaProvider } from '@/theme/tema';

import { TabBar, larguras } from './TabBar';

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

function criarProps(navigateToTab = jest.fn()) {
  const nomes = ['index', 'mapa', 'alertas', 'ajustes'];
  const titulos = ['Agora', 'Mapa', 'Alertas', 'Ajustes'];
  const rotas = nomes.map((nome, i) => ({
    key: `${nome}-${i}`,
    name: nome,
    params: undefined,
    path: undefined,
  }));

  const descriptors = Object.fromEntries(
    rotas.map((rota, i) => [
      rota.key,
      {
        options: {
          title: titulos[i],
          tabBarBadge: rota.name === 'alertas' ? 2 : undefined,
        },
        route: rota,
      },
    ]),
  );

  const props = {
    state: {
      index: 0,
      routes: rotas,
      routeNames: nomes,
      key: 'tabs',
      type: 'tab',
      stale: false,
      history: [],
    },
    descriptors,
    navigateToTab,
    emitter: {
      emit: jest.fn(() => ({ defaultPrevented: false })),
    },
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
  } as unknown as BottomTabBarProps;

  return { props, navigateToTab };
}

describe('TabBar', () => {
  it('renderiza as quatro abas, o badge e o Fab', async () => {
    const { props } = criarProps();
    const { getByLabelText, getByText } = await render(
      <TemaProvider inicial="escuro">
        <TabBar {...props} />
      </TemaProvider>,
    );

    expect(getByLabelText('Agora')).toBeTruthy();
    expect(getByLabelText('Mapa')).toBeTruthy();
    expect(getByLabelText('Alertas')).toBeTruthy();
    expect(getByLabelText('Ajustes')).toBeTruthy();
    expect(getByLabelText('Relatar')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
  });

  it('navega ao tocar numa aba inativa', async () => {
    const navigateToTab = jest.fn();
    const { props } = criarProps(navigateToTab);
    const { getByLabelText } = await render(
      <TemaProvider inicial="escuro">
        <TabBar {...props} />
      </TemaProvider>,
    );

    fireEvent.press(getByLabelText('Mapa'));
    expect(navigateToTab).toHaveBeenCalledWith('mapa-1');
  });
});

describe('larguras', () => {
  // Celular de 360 dp: 360 - gutter 2×16 - Fab 64 - espaço 8 = 256 para a barra
  it('cabe o rótulo ativo e mantém a área de toque das inativas em 360 dp', () => {
    const { ativa, inativa } = larguras(256, 4);
    expect(inativa).toBeGreaterThanOrEqual(44);
    // padding 2×12 + ícone 24 + espaço 6 + "Alertas" (~40 a 14 px, 46 com fonte a 115%)
    expect(ativa).toBeGreaterThanOrEqual(24 + 24 + 6 + 46);
  });

  it('mantém a proporção 2,3 : 1 do design', () => {
    const { ativa, inativa } = larguras(300, 4);
    expect(ativa / inativa).toBeCloseTo(2.3);
  });
});
