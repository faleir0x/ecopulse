import { render } from '@testing-library/react-native';

import { TemaProvider } from '@/theme/tema';

import { Icon } from './Icon';

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: jest.fn(() => null), setItemSync: jest.fn() },
}));

jest.mock('react-native-reanimated', () => ({
  useReducedMotion: () => false,
}));

describe('Icon', () => {
  it('expõe o rótulo acessível', async () => {
    const { getByLabelText } = await render(
      <TemaProvider inicial="escuro">
        <Icon name="map" rotulo="Mapa" />
      </TemaProvider>,
    );

    const icone = getByLabelText('Mapa');
    expect(icone.props.accessible).toBe(true);
    expect(icone.props.accessibilityLabel).toBe('Mapa');
  });
});
