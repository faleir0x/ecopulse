import { StyleSheet, View } from 'react-native';

import { T } from '@/components/T';
import { horaMinuto } from '@/features/mapa/tempo';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, raio, tamanho } from '@/theme/tokens';

export type CabecalhoProps = {
  endereco: string | null;
  medidoEm: string | null;
  online: boolean;
  erro?: boolean;
};

/** Local, atualização e ícone de sincronização (HANDOFF §5.1). */
export function Cabecalho({ endereco, medidoEm, online, erro = false }: CabecalhoProps) {
  const { cor } = useTema();
  const hora = medidoEm ? horaMinuto(medidoEm) : null;
  const semConexao = !online || erro;

  const linha = semConexao
    ? hora
      ? `Sem conexão · dados das ${hora}`
      : 'Sem conexão · sem leitura'
    : hora
      ? `São Paulo · atualizado ${hora}`
      : 'São Paulo · sem atualização';
  const local = endereco ?? 'São Paulo';

  return (
    <View style={styles.linha}>
      <View style={styles.texto}>
        <View style={styles.localLinha}>
          <Icon name="map-point" peso="bold" tamanho={tamanho.iconSm} cor={cor.textPrimary} />
          <T estilo="headline" cromo numberOfLines={1} style={styles.local}>
            {local}
          </T>
        </View>
        <T estilo="caption" cor="textSecondary" numberOfLines={1} style={styles.atualizado}>
          {linha}
        </T>
      </View>

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
