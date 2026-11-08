import Storage from 'expo-sqlite/kv-store';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { cores, severidade, type Esquema, type Paleta, type PaletaSeveridade } from './tokens';

export type PreferenciaTema = 'sistema' | 'claro' | 'escuro';

const CHAVE = 'ajustes.tema';
/** O design v6 é escuro primeiro. */
const PADRAO: PreferenciaTema = 'escuro';

export type Tema = {
  esquema: Esquema;
  preferencia: PreferenciaTema;
  definirPreferencia: (p: PreferenciaTema) => void;
  cor: Paleta;
  sev: PaletaSeveridade;
  /** "Reduzir movimento" do sistema: sem deslocamento, sem loops, só crossfade. */
  reduzirMovimento: boolean;
};

const TemaContext = createContext<Tema | null>(null);

export function resolverEsquema(preferencia: PreferenciaTema, sistema: Esquema | null): Esquema {
  if (preferencia === 'sistema') return sistema ?? 'escuro';
  return preferencia;
}

function lerPreferencia(): PreferenciaTema {
  try {
    const valor = Storage.getItemSync(CHAVE);
    return valor === 'sistema' || valor === 'claro' || valor === 'escuro' ? valor : PADRAO;
  } catch {
    return PADRAO;
  }
}

export function TemaProvider({ children, inicial }: { children: ReactNode; inicial?: PreferenciaTema }) {
  const [preferencia, setPreferencia] = useState<PreferenciaTema>(() => inicial ?? lerPreferencia());
  const sistema = useColorScheme();
  const reduzirMovimento = useReducedMotion();

  const definirPreferencia = useCallback((p: PreferenciaTema) => {
    setPreferencia(p);
    try {
      Storage.setItemSync(CHAVE, p);
    } catch {
      // Sem persistência o tema ainda muda nesta sessão
    }
  }, []);

  const valor = useMemo<Tema>(() => {
    const esquema = resolverEsquema(preferencia, sistema === 'light' ? 'claro' : sistema === 'dark' ? 'escuro' : null);
    return {
      esquema,
      preferencia,
      definirPreferencia,
      cor: cores[esquema],
      sev: severidade[esquema],
      reduzirMovimento,
    };
  }, [preferencia, sistema, definirPreferencia, reduzirMovimento]);

  return <TemaContext.Provider value={valor}>{children}</TemaContext.Provider>;
}

export function useTema(): Tema {
  const tema = useContext(TemaContext);
  if (!tema) throw new Error('useTema fora do TemaProvider');
  return tema;
}
