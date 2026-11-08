import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/Button';
import { T } from '@/components/T';
import { Icon } from '@/icons/Icon';
import { useTema } from '@/theme/tema';
import { espaco, tamanho } from '@/theme/tokens';

export type EstadoResposta = null | 'confirmado' | 'resolvido';

export type DetailFooterProps = {
  estado: EstadoResposta;
  onConfirmar: () => void;
  onResolvido: () => void;
  /** Sem "Desfazer" quando a confirmação já foi enviada (janela de 4 s esgotada). */
  onDesfazer?: () => void;
};

/** Rodapé fixo do detalhe: pergunta, ações e estado de resposta (com desfazer). */
export function DetailFooter({ estado, onConfirmar, onResolvido, onDesfazer }: DetailFooterProps) {
  const { cor } = useTema();

  if (estado === null) {
    return (
      <View style={styles.base}>
        <T estilo="headline" cromo numberOfLines={1}>
          Ainda está assim?
        </T>
        <View style={styles.botoes}>
          <Button rotulo="Já passou" variante="secundario" onPress={onResolvido} estilo={styles.botao} />
          <Button rotulo="Ainda está" onPress={onConfirmar} estilo={styles.botao} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.base}>
      <View style={[styles.feito, { backgroundColor: cor.surfaceMuted }]}>
        <Icon name="check-circle" tamanho={tamanho.icon} cor={cor.textPrimary} />
        <T estilo="body" cromo numberOfLines={1} style={styles.rotuloFeito}>
          {estado === 'confirmado' ? 'Confirmado' : 'Marcado como resolvido'}
        </T>
        {onDesfazer ? (
          <Pressable
            onPress={onDesfazer}
            accessibilityRole="button"
            accessibilityLabel="Desfazer"
            hitSlop={espaco.sm}
            style={styles.desfazer}
          >
            <T estilo="headline" cromo numberOfLines={1}>
              Desfazer
            </T>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    gap: 10,
  },
  botoes: {
    flexDirection: 'row',
    gap: 10,
  },
  botao: {
    flex: 1,
  },
  feito: {
    height: 52,
    borderRadius: 26,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingLeft: 16,
    paddingRight: 8,
  },
  rotuloFeito: {
    fontWeight: '600',
    flexShrink: 1,
    minWidth: 0,
  },
  desfazer: {
    marginLeft: 'auto',
    height: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
});
