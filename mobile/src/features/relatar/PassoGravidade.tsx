import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Button, SeverityMeter, T } from '@/components';
import type { MidiaLocal } from '@/data/outbox';
import {
  ROTULO_SEVERIDADE,
  SEVERIDADES,
  type Severidade,
  type TipoRisco,
} from '@/domain/tipos';
import { ICONE_TIPO } from '@/features/mapa/iconesTipo';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, movimento } from '@/theme/tokens';

import { dica } from './dicas';
import { MediaPicker } from './MediaPicker';
import { NoteField } from './NoteField';

const CURVA_SAIDA = Easing.bezier(
  movimento.curvas.out[0],
  movimento.curvas.out[1],
  movimento.curvas.out[2],
  movimento.curvas.out[3],
);

type TileSeveridadeProps = {
  severidade: Severidade;
  ativo: boolean;
  onPress: () => void;
};

function TileSeveridade({ severidade, ativo, onPress }: TileSeveridadeProps) {
  const { cor, sev, esquema, reduzirMovimento } = useTema();
  const borda = esquema === 'claro' ? sev.text[severidade] : sev.fill[severidade];
  const opacidade = useSharedValue(ativo ? 1 : 0);

  useEffect(() => {
    opacidade.value = withTiming(ativo ? 1 : 0, {
      duration: reduzirMovimento ? 180 : 200,
      easing: CURVA_SAIDA,
    });
  }, [ativo, opacidade, reduzirMovimento]);

  const estiloBorda = useAnimatedStyle(() => ({ opacity: opacidade.value }));

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={ROTULO_SEVERIDADE[severidade]}
      accessibilityState={{ selected: ativo }}
      style={({ pressed }) => [
        styles.sev,
        { backgroundColor: cor.surfaceMuted, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <SeverityMeter severidade={severidade} tamanho="m" animar={false} />
      <T estilo="caption" cromo numberOfLines={1} style={styles.sevRotulo}>
        {ROTULO_SEVERIDADE[severidade]}
      </T>
      <Animated.View
        pointerEvents="none"
        style={[styles.borda, { borderColor: borda }, estiloBorda]}
      />
    </Pressable>
  );
}

export type PassoGravidadeProps = {
  /** Passo na tela. Fora dele a caixa de detalhe não é montada: o Android daria foco ao
   * primeiro campo de texto da janela ao abrir a sheet (teclado aberto no passo 1). */
  visivel: boolean;
  tipo: TipoRisco | null;
  severidade: Severidade | null;
  onEscolher: (severidade: Severidade) => void;
  onVoltar: () => void;
  onEnviar: () => void;
  enviando: boolean;
  podeEnviar: boolean;
  offline: boolean;
  midias: MidiaLocal[];
  nota: string;
  onNota: (valor: string) => void;
  onAdicionarMidias: (novas: MidiaLocal[]) => void;
  onRemoverMidia: (indice: number) => void;
  onAbrirMidia: (indice: number) => void;
};

export function PassoGravidade({
  visivel,
  tipo,
  severidade,
  onEscolher,
  onVoltar,
  onEnviar,
  enviando,
  podeEnviar,
  offline,
  midias,
  nota,
  onNota,
  onAdicionarMidias,
  onRemoverMidia,
  onAbrirMidia,
}: PassoGravidadeProps) {
  const { cor } = useTema();
  const textoDica = tipo && severidade ? dica(tipo, severidade) : null;

  return (
    <View style={styles.raiz}>
      <View style={styles.sevs}>
        {SEVERIDADES.map((nivel) => (
          <TileSeveridade
            key={nivel}
            severidade={nivel}
            ativo={nivel === severidade}
            onPress={() => onEscolher(nivel)}
          />
        ))}
      </View>

      <View style={styles.dica}>
        {textoDica && tipo ? (
          <>
            <Icon name={ICONE_TIPO[tipo]} tamanho={18} cor={cor.textSecondary} />
            <T estilo="body" cor="textSecondary" numberOfLines={1} style={styles.dicaTexto}>
              {textoDica}
            </T>
          </>
        ) : (
          <T estilo="body" cor="textTertiary" numberOfLines={1}>
            Escolha um nível
          </T>
        )}
      </View>

      <MediaPicker
        midias={midias}
        onAdicionar={onAdicionarMidias}
        onRemover={onRemoverMidia}
        onAbrir={onAbrirMidia}
      />

      {visivel ? <NoteField valor={nota} onMudar={onNota} /> : null}

      <View style={styles.rodape}>
        <Pressable
          onPress={onVoltar}
          accessibilityRole="button"
          accessibilityLabel="Voltar"
          style={[styles.voltar, { backgroundColor: cor.surfaceMuted }]}
        >
          <Icon name="alt-arrow-left" tamanho={22} cor={cor.textPrimary} />
        </Pressable>
        <Button
          rotulo={offline ? 'Salvar na fila' : 'Enviar'}
          onPress={onEnviar}
          desabilitado={!podeEnviar}
          carregando={enviando}
          estilo={styles.enviar}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    gap: 14,
  },
  sevs: {
    flexDirection: 'row',
    gap: espaco.sm,
  },
  sev: {
    flex: 1,
    minWidth: 0,
    height: 88,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: espaco.xs,
  },
  sevRotulo: {
    fontSize: 12.5,
    lineHeight: 17,
    maxWidth: '100%',
    letterSpacing: -0.01,
  },
  borda: {
    ...StyleSheet.absoluteFill,
    borderRadius: 22,
    borderWidth: 2,
  },
  dica: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    paddingHorizontal: espaco.xs,
  },
  dicaTexto: {
    flex: 1,
    minWidth: 0,
  },
  rodape: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
    marginTop: espaco.xs,
  },
  voltar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enviar: {
    flex: 1,
  },
});
