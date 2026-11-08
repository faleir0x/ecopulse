import { Text, type TextProps } from 'react-native';

import { familia } from '@/theme/fontes';
import { useTema } from '@/theme/tema';
import { escalaFonte, texto, type EstiloTexto, type Paleta } from '@/theme/tokens';

export type TProps = TextProps & {
  estilo?: EstiloTexto;
  cor?: keyof Paleta;
  corHex?: string;
  tabular?: boolean;
  cromo?: boolean;
  heroi?: boolean;
};

export function T({
  estilo = 'body',
  cor = 'textPrimary',
  corHex,
  tabular = false,
  cromo = false,
  heroi = false,
  style,
  maxFontSizeMultiplier,
  ...props
}: TProps) {
  const { cor: paleta } = useTema();
  const def = texto[estilo];
  const maxFonte = cromo ? escalaFonte.cromoMax : heroi ? escalaFonte.heroiMax : maxFontSizeMultiplier;

  return (
    <Text
      {...props}
      maxFontSizeMultiplier={maxFonte}
      style={[
        {
          fontFamily: familia(def),
          fontSize: def.tamanho,
          lineHeight: def.alturaLinha,
          letterSpacing: def.espacamento,
          color: corHex ?? paleta[cor],
        },
        tabular && { fontVariant: ['tabular-nums' as const] },
        style,
      ]}
    />
  );
}
