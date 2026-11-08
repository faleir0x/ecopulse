import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T } from '@/components';
import type { MidiaLocal } from '@/data/outbox';
import type { Severidade, TipoRisco } from '@/domain/tipos';
import { useLocalizacao } from '@/features/localizacao';
import { useEndereco } from '@/features/mapa/useEndereco';
import { Icon } from '@/icons/Icon';
import { useRelatos } from '@/state/relatos';
import { useUi } from '@/state/ui';
import { useTema } from '@/theme/tema';
import { espaco, movimento, raio, tamanho } from '@/theme/tokens';

import { MediaViewer } from './MediaViewer';
import { MAX_MIDIAS } from './MediaPicker';
import { PassoGravidade } from './PassoGravidade';
import { PassoTipo } from './PassoTipo';
import { Sucesso } from './Sucesso';

const MARGEM = 8;
const AUTO_AVANCO_MS = 220;
const FECHAR_SUCESSO_MS = 1300;

const CURVA_SHEET = Easing.bezier(
  movimento.curvas.sheet[0],
  movimento.curvas.sheet[1],
  movimento.curvas.sheet[2],
  movimento.curvas.sheet[3],
);

type EstadoSucesso = { offline: boolean };

export function ReportSheet() {
  const { cor, reduzirMovimento } = useTema();
  const insets = useSafeAreaInsets();
  const { height: alturaTela } = useWindowDimensions();
  const { relatarAberto, setRelatarAberto } = useUi();
  const { estado, relatar } = useRelatos();
  const localizacao = useLocalizacao();
  const endereco = useEndereco(
    localizacao.status === 'ok' ? localizacao.coords : null,
  );

  const [passo, setPasso] = useState<1 | 2>(1);
  const [tipo, setTipo] = useState<TipoRisco | null>(null);
  const [severidade, setSeveridade] = useState<Severidade | null>(null);
  const [midias, setMidias] = useState<MidiaLocal[]>([]);
  const [nota, setNota] = useState('');
  const [notaAberta, setNotaAberta] = useState(false);
  const [visualizando, setVisualizando] = useState<number | null>(null);
  const [sucesso, setSucesso] = useState<EstadoSucesso | null>(null);
  const [enviando, setEnviando] = useState(false);

  const progresso = useSharedValue(0);
  const deslocamento = useSharedValue(0);
  const larguraPassos = useSharedValue(0);
  const timerAvanco = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerSucesso = useRef<ReturnType<typeof setTimeout> | null>(null);

  const temLocalizacao = localizacao.status === 'ok';

  const limparTimers = useCallback(() => {
    if (timerAvanco.current) {
      clearTimeout(timerAvanco.current);
      timerAvanco.current = null;
    }
    if (timerSucesso.current) {
      clearTimeout(timerSucesso.current);
      timerSucesso.current = null;
    }
  }, []);

  const reporFormulario = useCallback(() => {
    setPasso(1);
    setTipo(null);
    setSeveridade(null);
    setMidias([]);
    setNota('');
    setNotaAberta(false);
    setVisualizando(null);
    setSucesso(null);
    setEnviando(false);
  }, []);

  const fechar = useCallback(() => {
    limparTimers();
    reporFormulario();
    setRelatarAberto(false);
  }, [limparTimers, reporFormulario, setRelatarAberto]);

  useEffect(() => {
    if (!relatarAberto) {
      return;
    }
    progresso.value = reduzirMovimento
      ? withTiming(1, { duration: 180, easing: CURVA_SHEET })
      : withTiming(1, { duration: 500, easing: CURVA_SHEET });
  }, [relatarAberto, reduzirMovimento, progresso]);

  useEffect(() => {
    deslocamento.value = withTiming(passo === 2 ? 1 : 0, {
      duration: reduzirMovimento ? 180 : 500,
      easing: CURVA_SHEET,
    });
  }, [passo, deslocamento, reduzirMovimento]);

  useEffect(() => limparTimers, [limparTimers]);

  const estiloSheet = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progresso.value) * alturaTela }],
  }));
  const estiloScrim = useAnimatedStyle(() => ({ opacity: progresso.value }));
  const estiloPassos = useAnimatedStyle(() => ({
    transform: [{ translateX: -deslocamento.value * larguraPassos.value }],
  }));

  const escolherTipo = useCallback(
    (novo: TipoRisco) => {
      setTipo(novo);
      if (timerAvanco.current) {
        clearTimeout(timerAvanco.current);
      }
      timerAvanco.current = setTimeout(() => {
        timerAvanco.current = null;
        setPasso(2);
      }, reduzirMovimento ? 0 : AUTO_AVANCO_MS);
    },
    [reduzirMovimento],
  );

  const adicionarMidias = useCallback((novas: MidiaLocal[]) => {
    setMidias((atuais) => [...atuais, ...novas].slice(0, MAX_MIDIAS));
  }, []);

  const removerMidia = useCallback((indice: number) => {
    setMidias((atuais) => atuais.filter((_, posicao) => posicao !== indice));
  }, []);

  const enviar = useCallback(() => {
    if (!tipo || !severidade || localizacao.status !== 'ok') {
      return;
    }

    const offline = !estado.online;
    setEnviando(true);
    relatar(
      {
        tipo,
        severidade,
        descricao: nota.trim().length > 0 ? nota.trim() : null,
        latitude: localizacao.coords.latitude,
        longitude: localizacao.coords.longitude,
      },
      midias,
    );
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => undefined,
    );
    setEnviando(false);
    setSucesso({ offline });
    timerSucesso.current = setTimeout(() => {
      timerSucesso.current = null;
      fechar();
    }, FECHAR_SUCESSO_MS);
  }, [tipo, severidade, localizacao, estado.online, relatar, nota, midias, fechar]);

  const podeEnviar = severidade !== null && temLocalizacao && !enviando;

  // A sheet sobe junto com o teclado (o campo de nota fica visível ao digitar)
  const [teclado, setTeclado] = useState(0);
  useEffect(() => {
    const abrir = Keyboard.addListener('keyboardDidShow', (e) => setTeclado(e.endCoordinates.height));
    const fecharTeclado = Keyboard.addListener('keyboardDidHide', () => setTeclado(0));
    return () => {
      abrir.remove();
      fecharTeclado.remove();
    };
  }, []);

  // Voltar do Android com o teclado aberto só fecha o teclado (não descarta o relato)
  const aoVoltar = useCallback(() => {
    if (Keyboard.isVisible()) {
      Keyboard.dismiss();
      return;
    }
    fechar();
  }, [fechar]);

  return (
    <Modal
      visible={relatarAberto}
      transparent
      animationType="none"
      onRequestClose={aoVoltar}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={styles.raiz}>
        <Animated.View
          pointerEvents="box-none"
          style={[styles.scrim, { backgroundColor: cor.scrim }, estiloScrim]}
        >
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={fechar}
            accessibilityRole="button"
            accessibilityLabel="Fechar relato"
          />
        </Animated.View>

        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: cor.surface,
              bottom: (teclado > 0 ? teclado : insets.bottom) + MARGEM,
              left: MARGEM,
              right: MARGEM,
              maxHeight:
                alturaTela - insets.top - (teclado > 0 ? teclado : insets.bottom) - MARGEM * 2,
            },
            estiloSheet,
          ]}
        >
          <View style={styles.cabecalho}>
            <T estilo="title" numberOfLines={1} style={styles.titulo}>
              {passo === 1 ? 'O que você vê?' : 'Quão grave?'}
            </T>
            <Pressable
              onPress={fechar}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              style={[styles.fechar, { backgroundColor: cor.surfaceMuted }]}
            >
              <Icon name="close" tamanho={20} cor={cor.textPrimary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.rolagem}
            contentContainerStyle={styles.rolagemConteudo}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View
              style={styles.janela}
              onLayout={(evento) => {
                larguraPassos.value = evento.nativeEvent.layout.width;
              }}
            >
              <Animated.View style={[styles.passos, estiloPassos]}>
                <View
                  style={styles.passo}
                  importantForAccessibility={passo === 1 ? 'auto' : 'no-hide-descendants'}
                  accessibilityElementsHidden={passo !== 1}
                >
                  <PassoTipo
                    tipo={tipo}
                    onEscolher={escolherTipo}
                    endereco={endereco}
                    precisaoM={localizacao.status === 'ok' ? localizacao.precisaoM : null}
                    semLocalizacao={localizacao.status === 'negada' || localizacao.status === 'indisponivel'}
                    carregandoLocalizacao={localizacao.status === 'carregando'}
                  />
                </View>

                <View
                  style={styles.passo}
                  importantForAccessibility={passo === 2 ? 'auto' : 'no-hide-descendants'}
                  accessibilityElementsHidden={passo !== 2}
                >
                  <PassoGravidade
                    tipo={tipo}
                    severidade={severidade}
                    onEscolher={setSeveridade}
                    onVoltar={() => setPasso(1)}
                    onEnviar={enviar}
                    enviando={enviando}
                    podeEnviar={podeEnviar}
                    offline={!estado.online}
                    midias={midias}
                    nota={nota}
                    notaAberta={notaAberta}
                    onToggleNota={() => setNotaAberta((aberta) => !aberta)}
                    onNota={setNota}
                    onAdicionarMidias={adicionarMidias}
                    onRemoverMidia={removerMidia}
                    onAbrirMidia={setVisualizando}
                  />
                </View>
              </Animated.View>
            </View>
          </ScrollView>

          {sucesso ? <Sucesso offline={sucesso.offline} /> : null}
        </Animated.View>

        {visualizando !== null && midias[visualizando] ? (
          <MediaViewer
            midias={midias}
            indiceInicial={visualizando}
            onFechar={() => setVisualizando(null)}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  raiz: {
    flex: 1,
  },
  scrim: {
    ...StyleSheet.absoluteFill,
  },
  sheet: {
    position: 'absolute',
    borderRadius: raio.reportSheet,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    elevation: 16,
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaco.md,
    paddingTop: 20,
    paddingBottom: 6,
    paddingLeft: 24,
    paddingRight: 20,
  },
  titulo: {
    flex: 1,
    minWidth: 0,
  },
  fechar: {
    width: tamanho.touch,
    height: tamanho.touch,
    borderRadius: raio.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rolagem: {
    flexGrow: 0,
    flexShrink: 1,
  },
  rolagemConteudo: {
    flexGrow: 0,
  },
  janela: {
    overflow: 'hidden',
  },
  passos: {
    flexDirection: 'row',
    width: '200%',
  },
  passo: {
    width: '50%',
    paddingTop: espaco.sm,
    paddingHorizontal: 20,
    paddingBottom: 22,
  },
});
