import { Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/components/T';
import { horaMinuto } from '@/features/mapa/tempo';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, raio, tamanho } from '@/theme/tokens';

export type CabecalhoProps = {
  endereco: string | null;
  /** Cidade da posição (geocodificação reversa); funciona fora de São Paulo. */
  cidade?: string | null;
  medidoEm: string | null;
  online: boolean;
  erro?: boolean;
  /** Abre a busca de local; mostra o chevron. */
  onPress?: () => void;
};

/** Local, atualização e ícone de sincronização (HANDOFF §5.1). */
export function Cabecalho({
  endereco,
  cidade = null,
  medidoEm,
  online,
  erro = false,
  onPress,
}: CabecalhoProps) {
  const { cor } = useTema();
  const hora = medidoEm ? horaMinuto(medidoEm) : null;
  const semConexao = !online || erro;

  const linha = semConexao
    ? hora
      ? `Sem conexão · dados das ${hora}`
      : 'Sem conexão · sem leitura'
    : hora
      ? `${cidade ?? 'Sua região'} · atualizado ${hora}`
      : `${cidade ?? 'Sua região'} · sem atualização`;
  const local = endereco ?? cidade ?? 'Sua localização';

  const conteudo = (
    <>
      <View style={styles.localLinha}>
        <Icon name="map-point" peso="bold" tamanho={tamanho.iconSm} cor={cor.textPrimary} />
        <T estilo="headline" cromo numberOfLines={1} style={styles.local}>
          {local}
        </T>
        {onPress ? (
          <Icon name="alt-arrow-down" tamanho={tamanho.iconSm} cor={cor.textSecondary} />
        ) : null}
      </View>
      <T estilo="caption" cor="textSecondary" numberOfLines={1} style={styles.atualizado}>
        {linha}
      </T>
    </>
  );

  return (
    <View style={styles.linha}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={`Trocar local: ${local}`}
          style={styles.texto}
        >
          {conteudo}
        </Pressable>
      ) : (
        <View style={styles.texto}>{conteudo}</View>
      )}

      <View
        accessible
        accessibilityLabel={semConexao ? 'Sem conexão' : 'Sincronizado'}
        style={[styles.sincronizacao, { backgroundColor: cor.surface, borderColor: cor.line }]}
      >
        <Icon
          name={semConexao ? 'cloud-cross' : 'cloud-check'}
          tamanho={tamanho.icon}
          cor={cor.textPrimary}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  linha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaco.md,
    minHeight: tamanho.touch,
  },
  texto: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  localLinha: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  local: {
    flexShrink: 1,
    minWidth: 0,
  },
  atualizado: {
    paddingLeft: tamanho.iconSm + 6,
  },
  sincronizacao: {
    width: tamanho.touch,
    height: tamanho.touch,
    borderRadius: raio.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
