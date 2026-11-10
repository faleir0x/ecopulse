import { fireEvent, render } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { MidiaLocal } from '@/data/outbox';
import { UiProvider, useUi } from '@/state/ui';
import { TemaProvider } from '@/theme/tema';

import { MediaPicker } from './MediaPicker';
import { ReportSheet } from './ReportSheet';

const mockEstado = {
  online: true,
  pendentes: 0,
  enviando: false,
  ultimoEnvio: null as number | null,
};

type Resultado = 'enviado' | 'na_fila' | 'rejeitado';
const mockCriarPromessa = (resultado: Resultado) => {
  const promessa = Promise.resolve(resultado) as Promise<Resultado> & { clientId: string };
  promessa.clientId = 'client-id';
  return promessa;
};
const mockRelatar = jest.fn(() => mockCriarPromessa('enviado'));
const mockTentarDeNovo = jest.fn(async () => 'enviado' as Resultado);

jest.mock('@/state/relatos', () => ({
  useRelatos: () => ({
    estado: mockEstado,
    relatar: mockRelatar,
    tentarDeNovo: mockTentarDeNovo,
    meus: [],
    encerrar: jest.fn(),
  }),
}));

jest.mock('react-native-maps', () => {
  const { View } = jest.requireActual('react-native');
  return { __esModule: true, PROVIDER_GOOGLE: 'google', default: View };
});

jest.mock('@/features/localizacao', () => ({
  useLocalizacao: () => ({
    status: 'ok',
    coords: { latitude: -23.5613, longitude: -46.6565 },
    precisaoM: 12,
    simulada: false,
  }),
}));

jest.mock('@/features/mapa/useEndereco', () => ({
  useEndereco: () => 'Av. Antártica, 380',
}));

jest.mock('expo-sqlite/kv-store', () => ({
  __esModule: true,
  default: { getItemSync: jest.fn(() => null), setItemSync: jest.fn() },
}));

jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(async () => undefined),
  impactAsync: jest.fn(async () => undefined),
  selectionAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
  ImpactFeedbackStyle: { Light: 'light' },
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  openSettings: jest.fn(async () => undefined),
}));

jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('expo-video', () => ({
  VideoView: () => null,
  useVideoPlayer: () => ({ pause: jest.fn(), play: jest.fn() }),
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
    Easing: {
      bezier: () => identidade,
      inOut: identidade,
      ease: identidade,
      out: identidade,
      cubic: identidade,
    },
  };
});

const METRICAS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

function AbrirRelato() {
  const { setRelatarAberto } = useUi();

  useEffect(() => {
    setRelatarAberto(true);
  }, [setRelatarAberto]);

  return <ReportSheet />;
}

async function montarRelato() {
  return render(
    <SafeAreaProvider initialMetrics={METRICAS}>
      <TemaProvider inicial="escuro">
        <UiProvider>
          <AbrirRelato />
        </UiProvider>
      </TemaProvider>
    </SafeAreaProvider>,
  );
}

async function avancarParaGravidade(utilitarios: Awaited<ReturnType<typeof montarRelato>>) {
  await fireEvent.press(utilitarios.getByLabelText('Alagamento'));
  await utilitarios.findByText('Quão grave?');
}

describe('ReportSheet', () => {
  beforeEach(() => {
    mockEstado.online = true;
    mockRelatar.mockClear();
    mockTentarDeNovo.mockClear();
  });

  it('avança para a gravidade ao escolher o tipo', async () => {
    const utilitarios = await montarRelato();

    expect(utilitarios.getByText('O que você vê?')).toBeTruthy();
    expect(utilitarios.getByText('Av. Antártica, 380')).toBeTruthy();

    await avancarParaGravidade(utilitarios);

    expect(utilitarios.getByText('Quão grave?')).toBeTruthy();
  });

  it('mantém o Enviar desabilitado enquanto não há nível', async () => {
    const utilitarios = await montarRelato();
    await avancarParaGravidade(utilitarios);

    const enviar = utilitarios.getByLabelText('Enviar');
    expect(enviar.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

    await fireEvent.press(enviar);
    expect(mockRelatar).not.toHaveBeenCalled();
  });

  it('usa "Salvar na fila" quando está offline', async () => {
    mockEstado.online = false;
    const utilitarios = await montarRelato();
    await avancarParaGravidade(utilitarios);

    expect(utilitarios.getByText('Salvar na fila')).toBeTruthy();
  });

  it('mostra o sucesso na fila ao enviar offline', async () => {
    mockEstado.online = false;
    const utilitarios = await montarRelato();
    await avancarParaGravidade(utilitarios);

    await fireEvent.press(utilitarios.getByLabelText('Crítico'));
    await fireEvent.press(utilitarios.getByLabelText('Salvar na fila'));

    expect(await utilitarios.findByText('Na fila')).toBeTruthy();
    expect(mockRelatar).toHaveBeenCalledTimes(1);
  });

  it('mostra a falha quando o servidor não aceita e tenta de novo', async () => {
    mockRelatar.mockReturnValueOnce(mockCriarPromessa('na_fila'));
    mockTentarDeNovo.mockResolvedValueOnce('na_fila');
    const utilitarios = await montarRelato();
    await avancarParaGravidade(utilitarios);

    await fireEvent.press(utilitarios.getByLabelText('Crítico'));
    await fireEvent.press(utilitarios.getByLabelText('Enviar'));

    expect(await utilitarios.findByText('Não enviado')).toBeTruthy();
    expect(utilitarios.getByText('Fica na fila e sai sozinho')).toBeTruthy();

    await fireEvent.press(utilitarios.getByLabelText('Tentar de novo'));
    expect(mockTentarDeNovo).toHaveBeenCalledWith('client-id');
  });

  it('mostra a falha e libera o envio quando o SQLite não grava', async () => {
    mockRelatar.mockImplementationOnce(() => {
      throw new Error('disco cheio');
    });
    const utilitarios = await montarRelato();
    await avancarParaGravidade(utilitarios);

    await fireEvent.press(utilitarios.getByLabelText('Crítico'));
    await fireEvent.press(utilitarios.getByLabelText('Enviar'));

    expect(await utilitarios.findByText('Não enviado')).toBeTruthy();
    expect(mockRelatar).toHaveBeenCalledTimes(1);

    // Sem client_id não há o que repetir na fila; o botão refaz o envio inteiro.
    await fireEvent.press(utilitarios.getByLabelText('Tentar de novo'));
    expect(await utilitarios.findByText('Relato enviado')).toBeTruthy();
    expect(mockTentarDeNovo).not.toHaveBeenCalled();
  });

  it('mostra a dica do tipo e nível escolhidos', async () => {
    const utilitarios = await montarRelato();
    await avancarParaGravidade(utilitarios);

    await fireEvent.press(utilitarios.getByLabelText('Crítico'));
    expect(utilitarios.getByText('Intransitável')).toBeTruthy();
  });

  it('conta os caracteres do detalhe até 140', async () => {
    const utilitarios = await montarRelato();
    await avancarParaGravidade(utilitarios);

    // A caixa de detalhe já vem aberta
    const campo = utilitarios.getByPlaceholderText('O que está acontecendo?');

    expect(utilitarios.getByText('0/140')).toBeTruthy();
    await fireEvent.changeText(campo, 'Rua alagada');
    expect(utilitarios.getByText('11/140')).toBeTruthy();
  });
});

describe('MediaPicker', () => {
  const midias: MidiaLocal[] = [
    { uri: 'file://1.jpg', tipo: 'imagem' },
    { uri: 'file://2.jpg', tipo: 'imagem' },
    { uri: 'file://3.mp4', tipo: 'video' },
  ];

  it('desabilita Câmera e Galeria no limite de 3 mídias', async () => {
    const onAdicionar = jest.fn();
    const { getByLabelText } = await render(
      <TemaProvider inicial="escuro">
        <MediaPicker
          midias={midias}
          onAdicionar={onAdicionar}
          onRemover={jest.fn()}
          onAbrir={jest.fn()}
        />
      </TemaProvider>,
    );

    for (const rotulo of ['Câmera', 'Galeria']) {
      const botao = getByLabelText(rotulo);
      expect(botao.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
      await fireEvent.press(botao);
    }
    expect(onAdicionar).not.toHaveBeenCalled();
  });

  it('mostra Câmera e Galeria direto, sem passo intermediário', async () => {
    const { getByLabelText, queryByLabelText } = await render(
      <TemaProvider inicial="escuro">
        <MediaPicker
          midias={[]}
          onAdicionar={jest.fn()}
          onRemover={jest.fn()}
          onAbrir={jest.fn()}
        />
      </TemaProvider>,
    );

    expect(getByLabelText('Câmera').props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );
    expect(getByLabelText('Galeria')).toBeTruthy();
    expect(queryByLabelText('Foto')).toBeNull();
    expect(queryByLabelText('Detalhe')).toBeNull();
  });

  it('mostra a linha de permissão negada sem diálogo nativo', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValueOnce({
      status: 'denied',
    });

    const { getByLabelText, findByText } = await render(
      <TemaProvider inicial="escuro">
        <MediaPicker
          midias={[]}
          onAdicionar={jest.fn()}
          onRemover={jest.fn()}
          onAbrir={jest.fn()}
        />
      </TemaProvider>,
    );

    await fireEvent.press(getByLabelText('Câmera'));

    expect(await findByText(/Sem acesso à câmera/)).toBeTruthy();
    expect(getByLabelText('Ativar nas configurações')).toBeTruthy();
  });

  it('mostra a linha de falha quando a mídia não abre', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockRejectedValueOnce(
      new Error('falhou'),
    );

    const { getByLabelText, findByText } = await render(
      <TemaProvider inicial="escuro">
        <MediaPicker
          midias={[]}
          onAdicionar={jest.fn()}
          onRemover={jest.fn()}
          onAbrir={jest.fn()}
        />
      </TemaProvider>,
    );

    await fireEvent.press(getByLabelText('Câmera'));

    expect(await findByText('Não abriu. Tente de novo.')).toBeTruthy();
  });
});
