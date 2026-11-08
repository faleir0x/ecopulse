import { render } from '@testing-library/react-native';

import { TemaProvider } from '@/theme/tema';

import { T } from './T';

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: jest.fn(() => null), setItemSync: jest.fn() },
}));

jest.mock('react-native-reanimated', () => ({
  useReducedMotion: () => false,
}));

describe('T', () => {
  it('limita a escala de fonte no cromo', async () => {
    const { getByText } = await render(
      <TemaProvider inicial="escuro">
        <T cromo>Aba</T>
      </TemaProvider>,
    );

    expect(getByText('Aba').props.maxFontSizeMultiplier).toBe(1.15);
  });

  it('limita a escala de fonte no herói', async () => {
    const { getByText } = await render(
      <TemaProvider inicial="escuro">
        <T estilo="hero" heroi>
          27°
        </T>
      </TemaProvider>,
    );

    expect(getByText('27°').props.maxFontSizeMultiplier).toBe(1.12);
  });

  it('usa a cor e a fonte do token', async () => {
    const { getByText } = await render(
      <TemaProvider inicial="escuro">
        <T estilo="title">Título</T>
      </TemaProvider>,
    );

    const texto = getByText('Título');
    expect(texto.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fontFamily: 'RedHatDisplay_600SemiBold',
          color: '#F4F4F2',
        }),
      ]),
    );
  });
});
