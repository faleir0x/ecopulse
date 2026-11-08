import { Pressable, StyleSheet, View } from 'react-native';

import { Pill, T } from '@/components';
import { ROTULO_TIPO, TIPOS_RISCO, type TipoRisco } from '@/domain/tipos';
import { ICONE_TIPO } from '@/features/mapa/iconesTipo';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, raio } from '@/theme/tokens';

type TileProps = {
  tipo: TipoRisco;
  ativo: boolean;
  onPress: () => void;
};

function TileTipo({ tipo, ativo, onPress }: TileProps) {
  const { cor } = useTema();
  const frente = ativo ? cor.onInk : cor.textPrimary;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={ROTULO_TIPO[tipo]}
      accessibilityState={{ selected: ativo }}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: ativo ? cor.ink : cor.surfaceMuted, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <Icon name={ICONE_TIPO[tipo]} peso={ativo ? 'bold' : 'linear'} tamanho={30} cor={frente} />
      <T
        estilo="headline"
        cromo
        corHex={frente}
        numberOfLines={1}
        style={styles.tileRotulo}
      >
        {ROTULO_TIPO[tipo]}
      </T>
    </Pressable>
  );
}

export type PassoTipoProps = {
  tipo: TipoRisco | null;
  onEscolher: (tipo: TipoRisco) => void;
  onAjustar: () => void;
  endereco: string | null;
  precisaoM: number | null;
  semLocalizacao: boolean;
  carregandoLocalizacao: boolean;
};

export function PassoTipo({
  tipo,
  onEscolher,
  onAjustar,
  endereco,
  precisaoM,
  semLocalizacao,
  carregandoLocalizacao,
}: PassoTipoProps) {
  const { cor } = useTema();

  const linhas = [TIPOS_RISCO.slice(0, 2), TIPOS_RISCO.slice(2)];

  const textoLocal = semLocalizacao
    ? 'Sem localização'
    : (endereco ?? (carregandoLocalizacao ? 'Localizando…' : 'Endereço indisponível'));

  return (
    <View style={styles.raiz}>
      <View style={styles.grade}>
        {linhas.map((linha, indice) => (
          <View key={indice} style={styles.linha}>
            {linha.map((item) => (
              <TileTipo
                key={item}
                tipo={item}
                ativo={tipo === item}
                onPress={() => onEscolher(item)}
              />
            ))}
          </View>
        ))}
      </View>

      <View style={styles.localLinha}>
        <View style={[styles.local, { backgroundColor: cor.surfaceMuted }]}>
          <Icon name="map-point" tamanho={20} cor={cor.textSecondary} />
          <T
            estilo="body"
            cor={semLocalizacao ? 'textTertiary' : 'textPrimary'}
            numberOfLines={1}
            style={styles.endereco}
          >
            {textoLocal}
          </T>
          {!semLocalizacao && endereco && precisaoM !== null ? (
            <T estilo="caption" cor="textTertiary" tabular numberOfLines={1}>
              {`· ±${Math.round(precisaoM)} m`}
            </T>
          ) : null}
        </View>
        <Pill rotulo="Ajustar" icone="map-point" onPress={onAjustar} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  raiz: {
    gap: espaco.lg,
  },
  grade: {
    gap: 10,
  },
  linha: {
    flexDirection: 'row',
    gap: 10,
  },
  tile: {
    flex: 1,
    minWidth: 0,
    height: 112,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaco.md,
    paddingHorizontal: espaco.sm,
  },
  tileRotulo: {
    fontSize: 14,
    lineHeight: 18,
    maxWidth: '100%',
  },
  localLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.sm,
  },
  local: {
    flex: 1,
    minWidth: 0,
    height: 48,
    paddingHorizontal: 14,
    borderRadius: raio.chip,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  endereco: {
    flex: 1,
    minWidth: 0,
  },
});
