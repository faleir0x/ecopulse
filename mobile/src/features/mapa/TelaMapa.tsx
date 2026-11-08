import * as Haptics from 'expo-haptics';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MapView, { Circle, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OfflinePill, Pill, SegmentedFilter } from '@/components';
import { ROTULO_TIPO, TIPOS_RISCO, type Ocorrencia, type TipoRisco } from '@/domain/tipos';
import { useLocalizacao } from '@/features/localizacao';
import { estiloMapa } from '@/features/mapa/estiloMapa';
import { useConfirmar, useDetalhe, useOcorrencias } from '@/features/ocorrencias';
import { Icon } from '@/icons/Icon';
import type { Bbox } from '@/lib/geohash';
import { useRelatos } from '@/state/relatos';
import { useAjustes } from '@/state/ajustes';
import { useUi } from '@/state/ui';
import { useTema } from '@/theme/tema';
import { espaco, sheet as tokensSheet, tamanho } from '@/theme/tokens';

import { CamadaAmbiental } from './CamadaAmbiental';
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
  const { setModoFoco, ocorrenciaFoco, setOcorrenciaFoco } = useUi();
  const { raioM } = useAjustes();
  const { estado, meus } = useRelatos();

  const [filtro, setFiltro] = useState<TipoRisco | null>(null);
  const [camada, setCamada] = useState<Camada>('nenhuma');
  const [selecionadoId, setSelecionadoId] = useState<number | null>(null);
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [indiceDetent, setIndiceDetent] = useState(0);
  const [resposta, setResposta] = useState<EstadoResposta>(null);
  const [desfazerPendente, setDesfazerPendente] = useState(false);

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
  const origem = temLocalizacao ? localizacao.coords : CENTRO_SAO_PAULO;
  const modoFoco = selecionadoId !== null;

  const ocorrencias = useOcorrencias(bbox, filtro);
  const camadaAmbiente = useCamada(bbox, camada !== 'nenhuma');
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

  const cancelarTimer = useCallback(() => {
    if (timerConfirmacao.current) {
      clearTimeout(timerConfirmacao.current);
      timerConfirmacao.current = null;
    }
  }, []);

  const abrirDetalhe = useCallback(
    (id: number) => {
      cancelarTimer();
      setSelecionadoId(id);
      setResposta(RESOLVIDOS.has(id) ? 'resolvido' : null);
      setDesfazerPendente(false);
      indiceAlvo.current = 1;
      setModoFoco(true);
    },
    [cancelarTimer, setModoFoco],
  );

  // Saiu do Mapa (outra aba, onboarding): o modo foco não pode continuar escondendo a tab bar
  useFocusEffect(
    useCallback(() => () => setModoFoco(false), [setModoFoco]),
  );

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
    cancelarTimer();
    ultimoFoco.current = null;
    indiceAlvo.current = 1;
    setSelecionadoId(null);
    setDesfazerPendente(false);
    setModoFoco(false);
  }, [selecionadoId, cancelarTimer, setModoFoco]);

  const recentralizar = useCallback(() => {
    if (localizacao.status !== 'ok') return;
    cancelarTimer();
    ultimoFoco.current = null;
    indiceAlvo.current = 0;
    setSelecionadoId(null);
    setDesfazerPendente(false);
    setModoFoco(false);
    mapaRef.current?.animateCamera(
      { center: localizacao.coords, zoom: ZOOM_PADRAO, heading: 0, pitch: 0 },
      { duration: 600 },
    );
  }, [localizacao, cancelarTimer, setModoFoco]);

  const aoConfirmar = useCallback(() => {
    if (selecionadoId === null) return;
    cancelarTimer();
    setResposta('confirmado');
    setDesfazerPendente(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    timerConfirmacao.current = setTimeout(() => {
      timerConfirmacao.current = null;
      setDesfazerPendente(false);
      confirmar.mutate();
    }, JANELA_DESFAZER_MS);
  }, [selecionadoId, cancelarTimer, confirmar]);

  const aoResolvido = useCallback(() => {
    if (selecionadoId === null) return;
    cancelarTimer();
    RESOLVIDOS.add(selecionadoId);
    setResposta('resolvido');
    setDesfazerPendente(false);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  }, [selecionadoId, cancelarTimer]);

  const aoDesfazer = useCallback(() => {
    if (selecionadoId === null) return;
    if (resposta === 'resolvido') {
      RESOLVIDOS.delete(selecionadoId);
      setResposta(null);
      return;
    }
    if (resposta === 'confirmado' && desfazerPendente) {
      cancelarTimer();
      setDesfazerPendente(false);
      setResposta(null);
    }
  }, [selecionadoId, resposta, desfazerPendente, cancelarTimer]);

  const podeDesfazer = resposta === 'resolvido' || (resposta === 'confirmado' && desfazerPendente);

  // Centraliza na localização assim que ela fica disponível (uma vez).
  useEffect(() => {
    if (temLocalizacao && localizacao.status === 'ok' && !jaCentralizou.current) {
      jaCentralizou.current = true;
      mapaRef.current?.animateCamera(
        { center: localizacao.coords, zoom: ZOOM_PADRAO, heading: 0, pitch: 0 },
        { duration: 600 },
      );
    }
  }, [temLocalizacao, localizacao]);

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

  // Sincroniza o detent quando muda o modo (lista ↔ detalhe).
  useEffect(() => {
    const temporizador = setTimeout(() => {
      sheetRef.current?.snapToIndex(indiceAlvo.current);
    }, 50);
    return () => clearTimeout(temporizador);
  }, [modoFoco]);

  // Cancela o envio pendente ao sair da tela.
  useEffect(() => cancelarTimer, [cancelarTimer]);

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
        toolbarEnabled={false}
        showsCompass={false}
        showsMyLocationButton={false}
        zoomControlEnabled={false}
        showsBuildings={false}
        showsPointsOfInterests={false}
        mapPadding={modoFoco ? { top: 0, right: 0, bottom: tokensSheet.detail, left: 0 } : undefined}
        onRegionChangeComplete={(regiao) => setBbox(bboxDaRegiao(regiao))}
        onPress={fecharDetalhe}
      >
        <CamadaAmbiental celulas={camadaAmbiente.data ?? []} camada={camada} />

        {temLocalizacao && localizacao.status === 'ok' ? (
          <>
            <Circle
              center={localizacao.coords}
              radius={raioM}
              strokeColor={comAlfa(cor.accent, 0.45)}
              fillColor={comAlfa(cor.accent, 0.05)}
              strokeWidth={1.5}
            />
            <UserMarker coordenada={localizacao.coords} />
          </>
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

        {marcadores.map((ocorrencia) => (
          <IncidentMarker
            key={ocorrencia.id}
            ocorrencia={ocorrencia}
            selecionado={ocorrencia.id === selecionadoId}
            atenuado={selecionadoId !== null && ocorrencia.id !== selecionadoId}
            origem={origem}
            onPress={() => abrirDetalhe(ocorrencia.id)}
          />
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
      />

      <View pointerEvents="box-none" style={[styles.topo, { top: insets.top + espaco.sm }]}>
        {!estado.online || estado.pendentes > 0 ? (
          <View style={styles.offline}>
            <OfflinePill pendentes={estado.pendentes} online={estado.online} />
          </View>
        ) : null}
        <SegmentedFilter opcoes={opcoesFiltro} valor={filtro} onChange={setFiltro} />
        {camada !== 'nenhuma' ? (
          <View style={styles.legenda}>
            <LegendaCamada camada={camada} carregando={camadaAmbiente.isPending} />
          </View>
        ) : null}
        {!temLocalizacao ? (
          <View style={styles.semLocalizacao}>
            <Pill rotulo="Sem localização" />
          </View>
        ) : null}
      </View>

      {indiceDetent !== 2 ? (
        <Animated.View pointerEvents="box-none" style={[styles.controlesPos, estiloGps]}>
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
