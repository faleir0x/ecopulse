import { StyleSheet, View } from 'react-native';

import { NoReading } from '@/components/NoReading';
import { T } from '@/components/T';
import type { LeituraAmbiente } from '@/domain/tipos';
import { condicao } from '@/features/agora/tempo';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco } from '@/theme/tokens';

export type TempHeroProps = {
  leitura: LeituraAmbiente | null;
};

function ehNoite(iso: string): boolean {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return false;
  const hora = data.getHours();
  return hora < 6 || hora >= 18;
}

/** Temperatura em hero, condição e sensação (HANDOFF §5.2). */
export function TempHero({ leitura }: TempHeroProps) {
  const { cor } = useTema();

  if (!leitura || leitura.temperatura === null) {
    return (
      <View style={styles.semLeitura}>
        <NoReading />
      </View>
    );
  }

  const condicaoAtual = condicao(leitura.codigo_tempo, ehNoite(leitura.medido_em));
  const temperatura = Math.round(leitura.temperatura);
  const sensacao = leitura.sensacao === null ? null : Math.round(leitura.sensacao);

  return (
    <View
      style={styles.heroi}
      accessible
      accessibilityLabel={`${temperatura} graus, ${condicaoAtual.texto}${
        sensacao === null ? '' : `, sensação ${sensacao} graus`
      }`}
    >
      <T estilo="hero" heroi tabular numberOfLines={1} style={styles.temperatura}>
        {temperatura}°
      </T>

      <View style={styles.condicao}>
        <Icon
          name={condicaoAtual.icone}
          peso="bold-duotone"
          tamanho={44}
          cor={cor.textPrimary}
        />
        <T estilo="body" numberOfLines={2} style={styles.textoCondicao}>
          {condicaoAtual.texto}
        </T>
        {sensacao === null ? null : (
          <T estilo="caption" cor="textSecondary" numberOfLines={1}>
            Sensação {sensacao}°
          </T>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heroi: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: espaco.md,
    marginTop: espaco.lg,
    minHeight: 97,
  },
  semLeitura: {
    marginTop: espaco.xl,
    minHeight: 97,
    justifyContent: 'center',
  },
  temperatura: {
    marginLeft: -4,
    flexShrink: 0,
  },
  condicao: {
    flex: 1,
    minWidth: 0,
    alignItems: 'flex-end',
    gap: 6,
    paddingBottom: 6,
  },
  textoCondicao: {
    textAlign: 'right',
    fontWeight: '600',
  },
});
