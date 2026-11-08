import { render } from '@testing-library/react-native';

import type { MidiaLocal } from '@/data/outbox';
import { TemaProvider } from '@/theme/tema';

import { MediaThumb } from './MediaThumb';

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

const MIDIA: MidiaLocal = { uri: 'file://1.jpg', tipo: 'imagem' };

function montar(propriedades: { removivel?: boolean } = {}) {
  return render(
    <TemaProvider inicial="escuro">
      <MediaThumb
        midia={MIDIA}
        indice={0}
        tamanho={48}
        removivel={propriedades.removivel}
        onRemover={jest.fn()}
        onAbrir={jest.fn()}
      />
    </TemaProvider>,
  );
}

describe('MediaThumb', () => {
  it('mostra o botão de remover por padrão', async () => {
    const { getByLabelText } = await montar();

    expect(getByLabelText('Remover mídia')).toBeTruthy();
  });

  it('esconde o botão de remover com removivel=false', async () => {
    const { getByLabelText, queryByLabelText } = await montar({ removivel: false });

    expect(queryByLabelText('Remover mídia')).toBeNull();
    expect(getByLabelText('Abrir foto 1')).toBeTruthy();
  });
});
