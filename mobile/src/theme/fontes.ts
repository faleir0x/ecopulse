/**
 * Fontes Red Hat do design v6. O React Native escolhe a face pelo nome da
 * família, não por fontWeight; por isso cada peso é carregado com um nome próprio.
 */
import { RedHatDisplay_300Light } from '@expo-google-fonts/red-hat-display/300Light';
import { RedHatDisplay_600SemiBold } from '@expo-google-fonts/red-hat-display/600SemiBold';
import { RedHatText_400Regular } from '@expo-google-fonts/red-hat-text/400Regular';
import { RedHatText_600SemiBold } from '@expo-google-fonts/red-hat-text/600SemiBold';
import { RedHatText_700Bold } from '@expo-google-fonts/red-hat-text/700Bold';

import type { DefinicaoTexto } from './tokens';

/** Mapa aceito por `useFonts`: família carregada -> arquivo da fonte. */
export const fontes = {
  RedHatDisplay_300Light,
  RedHatDisplay_600SemiBold,
  RedHatText_400Regular,
  RedHatText_600SemiBold,
  RedHatText_700Bold,
};

const FAMILIAS = {
  display: {
    '300': 'RedHatDisplay_300Light',
    '600': 'RedHatDisplay_600SemiBold',
  },
  text: {
    '400': 'RedHatText_400Regular',
    '600': 'RedHatText_600SemiBold',
    '700': 'RedHatText_700Bold',
  },
} as const satisfies Record<DefinicaoTexto['familia'], Partial<Record<DefinicaoTexto['peso'], string>>>;

/** Nome da fonte carregada para a família + peso do token tipográfico. */
export function familia(def: DefinicaoTexto): string {
  const pesos = FAMILIAS[def.familia] as Partial<Record<DefinicaoTexto['peso'], string>>;
  const fonte = pesos[def.peso];
  if (!fonte) {
    throw new Error(`Fonte não carregada para ${def.familia} ${def.peso}`);
  }
  return fonte;
}
