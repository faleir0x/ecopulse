import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { useTema } from '@/theme/tema';
import { tamanho as tamanhoToken } from '@/theme/tokens';

import type { NomeIcone, PesoIcone } from './index';
import { ICONES_SVG } from './solar/icones';

export type IconProps = {
  name: NomeIcone;
  peso?: PesoIcone;
  tamanho?: number;
  cor?: string;
  rotulo?: string;
};

export function Icon({ name, peso = 'linear', tamanho = tamanhoToken.icon, cor, rotulo }: IconProps) {
  const { cor: paleta } = useTema();
  const chave = `${name}-${peso}`;
  const xml = ICONES_SVG[chave];

  if (!xml) {
    if (__DEV__) throw new Error(`Ícone Solar não gerado: ${chave}`);
    return null;
  }

  const acessibilidade = rotulo
    ? { accessible: true, accessibilityLabel: rotulo, accessibilityRole: 'image' as const }
    : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

  // A acessibilidade fica na View: o SvgXml repassa props ao <svg> na web
  return (
    <View {...acessibilidade} style={{ width: tamanho, height: tamanho }}>
      <SvgXml xml={xml} width={tamanho} height={tamanho} color={cor ?? paleta.textPrimary} />
    </View>
  );
}
