import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  PixelRatio,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import MapView, {
  Circle,
  PROVIDER_GOOGLE,
  type MapPressEvent,
  type Region,
} from 'react-native-maps';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OfflinePill, Pill, SegmentedFilter } from '@/components';
import {
  ROTULO_TIPO,
  TIPOS_RISCO,
  type CelulaAmbiente,
  type Ocorrencia,
  type TipoRisco,
} from '@/domain/tipos';
import { simularPercurso, ultimaPosicaoConhecida, useLocalizacao } from '@/features/localizacao';
import { estiloMapa } from '@/features/mapa/estiloMapa';
import { useConfirmar, useDetalhe, useOcorrencias, useResolver } from '@/features/ocorrencias';
import { DestinoMarker } from '@/features/rota/DestinoMarker';
import { RotaConteudo } from '@/features/rota/RotaConteudo';
import { RotaLinhas } from '@/features/rota/RotaLinhas';
import { RotaRodape } from '@/features/rota/RotaRodape';
import { useRotaSegura } from '@/features/rota/useRotaSegura';
import { Icon } from '@/icons/Icon';
import type { Bbox } from '@/lib/geohash';
import { useRelatos } from '@/state/relatos';
import { useAjustes } from '@/state/ajustes';
import { useUi } from '@/state/ui';
import { useTema } from '@/theme/tema';
import { espaco, sheet as tokensSheet, tamanho } from '@/theme/tokens';

import { agrupar, type Grupo } from './agrupar';
import { CamadaAmbiental, useSuperficie } from './CamadaAmbiental';
import { ClusterMarker } from './ClusterMarker';
import {
  CENTRO_SAO_PAULO,
  RAIO_AREA_SELECIONADA_M,
  ZOOM_PADRAO,
  ZOOM_SELECIONADO,
} from './constantes';
import { comAlfa } from './cor';
import type { EstadoResposta } from './DetailFooter';
import { ICONE_TIPO } from './iconesTipo';
import { IncidentMarker } from './IncidentMarker';
import { LegendaCamada } from './LegendaCamada';
import { MapSheet, type RefSheet } from './MapSheet';
import { PendingMarker } from './PendingMarker';
import { ocorrenciasNoRaio } from './ordenar';
import { bboxDoRaio } from '@/features/agora/escalas';
import { decodeBbox, encode } from '@/lib/geohash';
import { SeletorCamada } from './SeletorCamada';
import { useCamada, type Camada } from './useCamada';
import { useEndereco } from './useEndereco';
import { UserMarker } from './UserMarker';

const JANELA_DESFAZER_MS = 4000;
// Referência estável enquanto a camada carrega (a superfície é memoizada pelas células)
const SEM_CELULAS: CelulaAmbiente[] = [];

/** Zoom ao seguir a rota: perto o bastante para ver a próxima esquina. */
const ZOOM_SEGUINDO = 17;

/** Ids marcados como "Já passou" nesta sessão (ainda não há endpoint). */
const RESOLVIDOS = new Set<number>();

function bboxDaRegiao(regiao: Region): Bbox {
  return {
    latMin: regiao.latitude - regiao.latitudeDelta / 2,
    latMax: regiao.latitude + regiao.latitudeDelta / 2,
    lonMin: regiao.longitude - regiao.longitudeDelta / 2,
    lonMax: regiao.longitude + regiao.longitudeDelta / 2,
  };
}

export function TelaMapa() {
  const { cor, sev, esquema } = useTema();
  const insets = useSafeAreaInsets();
  const { width: larguraTela } = useWindowDimensions();
  const { setModoFoco, ocorrenciaFoco, setOcorrenciaFoco } = useUi();
  const { raioM } = useAjustes();
  const { estado, meus } = useRelatos();

  const [filtro, setFiltro] = useState<TipoRisco | null>(null);
  const [camada, setCamada] = useState<Camada>('nenhuma');
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [regiao, setRegiao] = useState<Region | null>(null);
  const [indiceDetent, setIndiceDetent] = useState(0);
  const [resposta, setResposta] = useState<EstadoResposta>(null);
  const [desfazerPendente, setDesfazerPendente] = useState(false);
  const [modoRota, setModoRota] = useState(false);
  // Câmera acompanha o usuário no "Seguir rota" até ele arrastar o mapa
  const [cameraSegue, setCameraSegue] = useState(false);

  const mapaRef = useRef<MapView>(null);
  const sheetRef = useRef<RefSheet>(null);
  const posicaoSheet = useSharedValue(0);
  const alturaTela = useSharedValue(0);
  const timerConfirmacao = useRef<ReturnType<typeof setTimeout> | null>(null);
  const indiceAlvo = useRef(1);
  const ultimoFoco = useRef<number | null>(null);
  const jaCentralizou = useRef(false);

  const localizacao = useLocalizacao();
  const temLocalizacao = localizacao.status === 'ok';
  // Sem posição ainda: a última conhecida do aparelho (não São Paulo para quem está em outra cidade)
  const [ultimaConhecida] = useState(() => ultimaPosicaoConhecida());
  const origem = temLocalizacao ? localizacao.coords : (ultimaConhecida ?? CENTRO_SAO_PAULO);
  // Cada vez que o MapView (re)nasce ele volta para a initialCamera: centraliza de novo
  const [versaoMapa, setVersaoMapa] = useState(0);
  const modoFoco = selecionadoId !== null;
  const rota = useRotaSegura(temLocalizacao ? localizacao.coords : null);
  const { fase: faseRota, limpar: limparRota, setDestino: setDestinoRota, voltar: voltarRota } = rota;
  const faseAnterior = useRef(rota.fase);

  const ocorrencias = useOcorrencias(bbox, filtro);
  const camadaAmbiente = useCamada(bbox, camada !== 'nenhuma');
  const superficie = useSuperficie(camadaAmbiente.data ?? SEM_CELULAS, camada);
  const detalhe = useDetalhe(selecionadoId);
  const confirmar = useConfirmar(selecionadoId ?? -1);
  const endereco = useEndereco(
    detalhe.data ? { latitude: detalhe.data.latitude, longitude: detalhe.data.longitude } : null,
  );

  // A lista ("N ocorrências · em 1 km") é sobre o usuário, não sobre a câmera: busca em volta
  // da posição, presa à célula geohash6 (andar não refaz a busca a cada segundo)
  const celulaOrigem = encode(origem.latitude, origem.longitude, 6);
  const bboxLista = useMemo(() => {
    const c = decodeBbox(celulaOrigem);
    return bboxDoRaio({ latitude: (c.latMin + c.latMax) / 2, longitude: (c.lonMin + c.lonMax) / 2 }, raioM + 800);
  }, [celulaOrigem, raioM]);
  const proximas = useOcorrencias(bboxLista, filtro);
  // Marcadores = área visível + em volta do usuário (sem duplicar): o que está na lista ou foi
  // aberto por ela aparece na hora, sem esperar a busca da câmera
  const marcadores = useMemo(() => {
    const porId = new Map<number, Ocorrencia>();
    for (const o of [...(proximas.data ?? []), ...(ocorrencias.data ?? [])]) porId.set(o.id, o);
    return [...porId.values()];
  }, [proximas.data, ocorrencias.data]);
  const lista = useMemo(
    () => ocorrenciasNoRaio(proximas.data ?? [], origem, raioM),
    [proximas.data, origem, raioM],
  );

  // Marcadores próximos (menos de ~56 dp na tela) viram um marcador de grupo; a selecionada fica solta
  const { soltos, grupos } = useMemo(() => {
    if (!regiao) return { soltos: marcadores, grupos: [] as Grupo[] };
    const fixos = new Set<number>(selecionadoId === null ? [] : [selecionadoId]);
    return agrupar(marcadores, regiao, larguraTela, fixos);
  }, [marcadores, regiao, larguraTela, selecionadoId]);

  const pendentes = useMemo(() => meus.filter((relato) => relato.status === 'pendente'), [meus]);

  const selecionada =
    selecionadoId === null
      ? null
      : marcadores.find((o) => o.id === selecionadoId) ?? null;

  const opcoesFiltro = useMemo(
    () => [
      { valor: null as TipoRisco | null, rotulo: 'Tudo', icone: 'layers-minimalistic' as const },
      ...TIPOS_RISCO.map((tipo) => ({
        valor: tipo as TipoRisco | null,
        rotulo: ROTULO_TIPO[tipo],
        icone: ICONE_TIPO[tipo],
      })),
    ],
    [],
  );

  // Confirmar/"Já passou" esperam JANELA_DESFAZER_MS antes de ir ao servidor. Desfazer descarta;
  // sair do detalhe (ou da tela) antes disso envia na hora em vez de perder a resposta
  const acaoPendente = useRef<(() => void) | null>(null);
  const cancelarTimer = useCallback(() => {
    if (timerConfirmacao.current) {
      clearTimeout(timerConfirmacao.current);
      timerConfirmacao.current = null;
    }
    acaoPendente.current = null;
  }, []);
  const efetivarPendente = useCallback(() => {
    const acao = acaoPendente.current;
    cancelarTimer();
    acao?.();
  }, [cancelarTimer]);
  const agendar = useCallback(
    (acao: () => void) => {
      efetivarPendente();
      acaoPendente.current = acao;
      timerConfirmacao.current = setTimeout(() => {
        timerConfirmacao.current = null;
        acaoPendente.current = null;
        setDesfazerPendente(false);
        acao();
      }, JANELA_DESFAZER_MS);
    },
    [efetivarPendente],
  );

  const abrirDetalhe = useCallback(
    (id: number) => {
      efetivarPendente();
      setSelecionadoId(id);
      setResposta(RESOLVIDOS.has(id) ? 'resolvido' : null);
      setDesfazerPendente(false);
      indiceAlvo.current = 1;
      setModoFoco(true);
    },
    [efetivarPendente, setModoFoco],
  );

  const sairRota = useCallback(() => {
    simularPercurso(null);
    setCameraSegue(false);
    limparRota();
    indiceAlvo.current = 0;
    setModoRota(false);
    setModoFoco(false);
  }, [limparRota, setModoFoco]);

  // Saiu do Mapa (outra aba, onboarding): o modo foco não pode continuar escondendo a tab bar
  useFocusEffect(useCallback(() => () => sairRota(), [sairRota]));

  // Toque num alerta ou notificação: abre o detalhe da ocorrência pedida
  // (no próximo tick: a aba acabou de montar e o mapa precisa existir antes da câmera mover)
  useEffect(() => {
    if (ocorrenciaFoco === null) return;
    const t = setTimeout(() => {
      abrirDetalhe(ocorrenciaFoco);
      setOcorrenciaFoco(null);
    }, 0);
    return () => clearTimeout(t);
  }, [ocorrenciaFoco, abrirDetalhe, setOcorrenciaFoco]);

  const fecharDetalhe = useCallback(() => {
    if (selecionadoId === null) return;
    efetivarPendente();
    ultimoFoco.current = null;
    indiceAlvo.current = 1;
    setSelecionadoId(null);
    setDesfazerPendente(false);
    setModoFoco(false);
  }, [selecionadoId, efetivarPendente, setModoFoco]);

  const entrarRota = useCallback(() => {
    if (selecionadoId !== null) fecharDetalhe();
    setModoRota(true);
    setModoFoco(true);
    indiceAlvo.current = 1;
  }, [selecionadoId, fecharDetalhe, setModoFoco]);

  const recentralizar = useCallback(() => {
    if (localizacao.status !== 'ok') return;
    if (modoRota) {
      // No modo rota só move a câmera: a sheet e a tab bar seguem o estado da rota
      if (faseRota === 'seguindo') setCameraSegue(true);
      mapaRef.current?.animateCamera(
        { center: localizacao.coords, zoom: ZOOM_SEGUINDO, heading: 0, pitch: 0 },
        { duration: 600 },
      );
      return;
    }
    efetivarPendente();
    ultimoFoco.current = null;
    indiceAlvo.current = 0;
    setSelecionadoId(null);
    setDesfazerPendente(false);
    setModoFoco(false);
    mapaRef.current?.animateCamera(
      { center: localizacao.coords, zoom: ZOOM_PADRAO, heading: 0, pitch: 0 },
      { duration: 600 },
    );
  }, [localizacao, modoRota, faseRota, efetivarPendente, setModoFoco]);

  // "Seguir rota": a sheet desce para o peek e só depois a câmera aproxima do usuário
  // (mexer na câmera durante a troca de mapPadding cancela o zoom no Android)
  const { seguir: seguirRotaEstado } = rota;
  const timerSeguir = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seguirRota = useCallback(() => {
    seguirRotaEstado();
    // Demonstração: com posição simulada, o usuário "anda" pela rota segura
    if (rota.rota && localizacao.status === 'ok' && localizacao.simulada) {
      simularPercurso(rota.rota.coordenadas.map(([latitude, longitude]) => ({ latitude, longitude })));
    }
    if (timerSeguir.current) clearTimeout(timerSeguir.current);
    timerSeguir.current = setTimeout(() => {
      timerSeguir.current = null;
      setCameraSegue(true);
    }, 450);
  }, [seguirRotaEstado, rota.rota, localizacao]);
  useEffect(
    () => () => {
      if (timerSeguir.current) clearTimeout(timerSeguir.current);
    },
    [],
  );

  const { mutate: confirmarMutate } = confirmar;
  const { mutate: resolverMutate } = useResolver();

  const aoConfirmar = useCallback(() => {
    if (selecionadoId === null) return;
    setResposta('confirmado');
    setDesfazerPendente(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    agendar(() => confirmarMutate());
  }, [selecionadoId, agendar, confirmarMutate]);

  const aoResolvido = useCallback(() => {
    if (selecionadoId === null) return;
    const id = selecionadoId;
    RESOLVIDOS.add(id);
    setResposta('resolvido');
    setDesfazerPendente(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    agendar(() => resolverMutate(id));
  }, [selecionadoId, agendar, resolverMutate]);

  const aoDesfazer = useCallback(() => {
    if (selecionadoId === null || !desfazerPendente) return;
    if (resposta === 'resolvido') RESOLVIDOS.delete(selecionadoId);
    cancelarTimer();
    setDesfazerPendente(false);
    setResposta(null);
  }, [selecionadoId, resposta, desfazerPendente, cancelarTimer]);

  const podeDesfazer = resposta !== null && desfazerPendente;

  const aoPressionarMapa = useCallback(
    (evento: MapPressEvent) => {
      if (modoRota) {
        if (faseRota !== 'seguindo') {
          setDestinoRota(evento.nativeEvent.coordinate);
          void Haptics.selectionAsync().catch(() => undefined);
        }
        return;
      }
      fecharDetalhe();
    },
    [modoRota, faseRota, setDestinoRota, fecharDetalhe],
  );

  // Tocar no grupo centraliza nele e aproxima 2 níveis (tocar de novo separa mais). No modo rota
  // não faz nada. fitToCoordinates com pontos quase iguais joga o grupo na borda no Android
  const abrirGrupo = useCallback(
    (grupo: Grupo) => {
      if (modoRota || !regiao) return;
      const zoomAtual = Math.log2((360 * larguraTela) / (256 * regiao.longitudeDelta));
      mapaRef.current?.animateCamera(
        {
          center: { latitude: grupo.latitude, longitude: grupo.longitude },
          zoom: Math.min(zoomAtual + 2, 18),
        },
        { duration: 500 },
      );
    },
    [modoRota, regiao, larguraTela],
  );

  // Voltar do Android: no modo rota sai ou volta para a escolha do destino.
  useEffect(() => {
    if (!modoRota) return;
    const inscricao = BackHandler.addEventListener('hardwareBackPress', () => {
      if (faseRota === 'destino') sairRota();
      else voltarRota();
      return true;
    });
    return () => inscricao.remove();
  }, [modoRota, faseRota, voltarRota, sairRota]);

  // Centraliza na localização assim que ela fica disponível (uma vez por mapa montado).
  useEffect(() => {
    if (temLocalizacao && localizacao.status === 'ok' && !jaCentralizou.current) {
      jaCentralizou.current = true;
      mapaRef.current?.animateCamera(
        { center: localizacao.coords, zoom: ZOOM_PADRAO, heading: 0, pitch: 0 },
        { duration: 600 },
      );
    }
  }, [temLocalizacao, localizacao, versaoMapa]);

  // Ao abrir o detalhe, foca o alvo (a mapPadding deixa a área acima da sheet livre).
  useEffect(() => {
    if (selecionadoId === null || ultimoFoco.current === selecionadoId) return;
    const alvo = marcadores.find((o) => o.id === selecionadoId) ?? detalhe.data;
    if (!alvo) return;
    ultimoFoco.current = selecionadoId;
    mapaRef.current?.animateCamera(
      {
        center: { latitude: alvo.latitude, longitude: alvo.longitude },
        zoom: ZOOM_SELECIONADO,
        heading: 0,
        pitch: 0,
      },
      { duration: 600 },
    );
  }, [selecionadoId, marcadores, detalhe.data]);

  // Câmera da rota: enquadra origem/destino/linhas no resultado e centraliza ao seguir.
  useEffect(() => {
    if (faseAnterior.current === rota.fase) return;
    faseAnterior.current = rota.fase;
    if (!modoRota) return;

    if (rota.fase === 'resultado' && rota.rota) {
      const pontos = [
        ...(temLocalizacao ? [localizacao.coords] : []),
        ...(rota.destino ? [rota.destino] : []),
        ...rota.rota.coordenadas.map(([latitude, longitude]) => ({ latitude, longitude })),
      ];
      if (!rota.rota.sem_desvio && rota.rota.direta) {
        pontos.push(
          ...rota.rota.direta.coordenadas.map(([latitude, longitude]) => ({ latitude, longitude })),
        );
      }
      if (pontos.length >= 2) {
        // A mapPadding já desconta a sheet; no Android o edgePadding é em pixels físicos
        const escala = Platform.OS === 'android' ? PixelRatio.get() : 1;
        mapaRef.current?.fitToCoordinates(pontos, {
          edgePadding: {
            top: (insets.top + 72) * escala,
            right: 48 * escala,
            bottom: 48 * escala,
            left: 48 * escala,
          },
          animated: true,
        });
      }
    }
  }, [rota.fase, rota.rota, rota.destino, modoRota, temLocalizacao, localizacao, insets.top]);

  // "Seguir rota": a câmera vai junto com o usuário no zoom de rua. Cada passo já leva o zoom
  // (uma animação só de centro cancelaria a de zoom); arrastar ou pinçar o mapa para de seguir
  const posicaoSeguida = localizacao.status === 'ok' ? localizacao.coords : null;
  useEffect(() => {
    if (!modoRota || faseRota !== 'seguindo' || !cameraSegue || !posicaoSeguida) return;
    mapaRef.current?.animateCamera(
      { center: posicaoSeguida, zoom: ZOOM_SEGUINDO, heading: 0, pitch: 0 },
      { duration: 900 },
    );
  }, [modoRota, faseRota, cameraSegue, posicaoSeguida]);

  // Sincroniza o detent quando muda o modo (lista ↔ detalhe ↔ rota).
  useEffect(() => {
    const temporizador = setTimeout(() => {
      const indice = modoRota ? (rota.fase === 'seguindo' ? 0 : 1) : indiceAlvo.current;
      sheetRef.current?.snapToIndex(indice);
    }, 50);
    return () => clearTimeout(temporizador);
  }, [modoFoco, modoRota, rota.fase]);

  // Saiu da tela com resposta pendente: envia na hora.
  useEffect(() => efetivarPendente, [efetivarPendente]);

  const estiloGps = useAnimatedStyle(() => ({
    bottom: alturaTela.value - posicaoSheet.value + espaco.lg,
  }));

  return (
    <View
      style={styles.tela}
      onLayout={(evento) => {
        alturaTela.value = evento.nativeEvent.layout.height;
      }}
    >
      <MapView
        // O Google Maps no Android não reaplica o customMapStyle ao trocar o tema: recria o mapa
        key={esquema}
        ref={mapaRef}
        provider={PROVIDER_GOOGLE}
        customMapStyle={estiloMapa(esquema)}
        initialCamera={{
          center: origem,
          zoom: ZOOM_PADRAO,
          heading: 0,
          pitch: 0,
        }}
        style={StyleSheet.absoluteFill}
        onMapReady={() => {
          jaCentralizou.current = false;
          setVersaoMapa((versao) => versao + 1);
        }}
        toolbarEnabled={false}
        showsCompass={false}
        showsMyLocationButton={false}
        zoomControlEnabled={false}
        // Prédios do zoom 18 em diante (até o 17 o Google desenha só a planta); câmera sempre
        // de cima, então ficam como blocos na cor building do estilo
        showsBuildings
        showsPointsOfInterests={false}
        mapPadding={
          modoRota
            ? {
                top: 0,
                right: 0,
                bottom: rota.fase === 'seguindo' ? tokensSheet.peek : tokensSheet.half,
                left: 0,
              }
            : modoFoco
              ? { top: 0, right: 0, bottom: tokensSheet.detail, left: 0 }
              : undefined
        }
        onRegionChangeComplete={(novaRegiao) => {
          setRegiao(novaRegiao);
          setBbox(bboxDaRegiao(novaRegiao));
        }}
        onPress={aoPressionarMapa}
        onPanDrag={cameraSegue ? () => setCameraSegue(false) : undefined}
      >
        <CamadaAmbiental superficie={superficie} />

        {temLocalizacao && localizacao.status === 'ok' ? (
          <>
            <Circle
              // O Circle do Android não redesenha quando só o centro muda: recria a cada posição
              key={`${localizacao.coords.latitude},${localizacao.coords.longitude}`}
              center={localizacao.coords}
              radius={raioM}
              strokeColor={comAlfa(cor.accent, 0.45)}
              fillColor={comAlfa(cor.accent, 0.05)}
              strokeWidth={1.5}
            />
            <UserMarker coordenada={localizacao.coords} />
          </>
        ) : null}

        {rota.destino ? <DestinoMarker coordenada={rota.destino} /> : null}
        {rota.rota ? (
          <RotaLinhas
            rota={rota.rota}
            mostrarDireta={rota.fase === 'resultado' && !rota.rota.sem_desvio}
          />
        ) : null}

        {selecionada ? (
          <Circle
            center={{ latitude: selecionada.latitude, longitude: selecionada.longitude }}
            radius={RAIO_AREA_SELECIONADA_M}
            fillColor={comAlfa(sev.fill[selecionada.severidade], 0.14)}
            strokeColor="transparent"
            strokeWidth={0}
          />
        ) : null}

        {soltos.map((ocorrencia) => (
          <IncidentMarker
            key={ocorrencia.id}
            ocorrencia={ocorrencia}
            selecionado={ocorrencia.id === selecionadoId}
            atenuado={selecionadoId !== null && ocorrencia.id !== selecionadoId}
            origem={origem}
            onPress={() => {
              if (!modoRota) abrirDetalhe(ocorrencia.id);
            }}
          />
        ))}

        {grupos.map((grupo) => (
          <ClusterMarker key={grupo.chave} grupo={grupo} onPress={() => abrirGrupo(grupo)} />
        ))}

        {pendentes.map((relato) => (
          <PendingMarker key={relato.client_id} relato={relato} />
        ))}
      </MapView>

      <MapSheet
        sheetRef={sheetRef}
        posicao={posicaoSheet}
        onChange={setIndiceDetent}
        modoFoco={modoFoco}
        lista={lista}
        origem={origem}
        raioM={raioM}
        carregando={proximas.isPending}
        erro={proximas.isError}
        temFiltro={filtro !== null}
        onTentar={() => void proximas.refetch()}
        onLimparFiltro={() => setFiltro(null)}
        onAbrir={abrirDetalhe}
        detalhe={detalhe.data ?? null}
        detalheCarregando={detalhe.isPending}
        detalheErro={detalhe.isError}
        endereco={endereco}
        onVoltar={fecharDetalhe}
        onTentarDetalhe={() => void detalhe.refetch()}
        estadoResposta={resposta}
        onConfirmar={aoConfirmar}
        onResolvido={aoResolvido}
        onDesfazer={podeDesfazer ? aoDesfazer : undefined}
        rota={
          modoRota
            ? {
                conteudo: <RotaConteudo estado={rota} origem={origem} onSair={sairRota} />,
                rodape: <RotaRodape estado={{ ...rota, seguir: seguirRota }} onSair={sairRota} />,
              }
            : null
        }
      />

      <View pointerEvents="box-none" style={[styles.topo, { top: insets.top + espaco.sm }]}>
        {!estado.online || estado.pendentes > 0 ? (
          <View style={styles.offline}>
            <OfflinePill pendentes={estado.pendentes} online={estado.online} />
          </View>
        ) : null}
        {!modoRota ? (
          <SegmentedFilter opcoes={opcoesFiltro} valor={filtro} onChange={setFiltro} />
        ) : null}
        {camada !== 'nenhuma' && !modoRota ? (
          <View style={styles.legenda}>
            <LegendaCamada
              camada={camada}
              carregando={camadaAmbiente.isPending}
              escala={superficie?.escala ?? null}
            />
          </View>
        ) : null}
        {/* Procurando o GPS não é erro: só "Sem localização" quando negada/indisponível */}
        {localizacao.status === 'carregando' ? (
          <View style={styles.semLocalizacao}>
            <Pill rotulo="Localizando…" carregando />
          </View>
        ) : !temLocalizacao ? (
          <View style={styles.semLocalizacao}>
            <Pill
              rotulo="Sem localização"
              icone="map-point"
              onPress={() => router.navigate('/local')}
            />
          </View>
        ) : null}
      </View>

      {indiceDetent !== 2 ? (
        <Animated.View pointerEvents="box-none" style={[styles.controlesPos, estiloGps]}>
          {temLocalizacao && !modoRota && selecionadoId === null ? (
            <Pressable
              onPress={entrarRota}
              accessibilityRole="button"
              accessibilityLabel="Rota segura"
              style={[styles.gps, { backgroundColor: cor.surface, borderColor: cor.line }]}
            >
              <Icon name="routing-2" tamanho={tamanho.icon} cor={cor.textPrimary} />
            </Pressable>
          ) : null}
          <SeletorCamada valor={camada} onChange={setCamada} />
          {temLocalizacao ? (
            <Pressable
              onPress={recentralizar}
              accessibilityRole="button"
              accessibilityLabel="Minha localização"
              style={[styles.gps, { backgroundColor: cor.surface, borderColor: cor.line }]}
            >
              <Icon name="gps" tamanho={tamanho.icon} cor={cor.textPrimary} />
            </Pressable>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  tela: {
    flex: 1,
  },
  topo: {
    position: 'absolute',
    left: espaco.gutter,
    right: espaco.gutter,
    alignItems: 'center',
    zIndex: 20,
  },
  offline: {
    marginBottom: espaco.sm,
  },
  semLocalizacao: {
    marginTop: espaco.sm,
    alignItems: 'center',
  },
  legenda: {
    alignSelf: 'flex-start',
    marginTop: espaco.sm,
  },
  controlesPos: {
    position: 'absolute',
    right: espaco.gutter,
    zIndex: 15,
    alignItems: 'flex-end',
    gap: espaco.sm,
  },
  gps: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
});
