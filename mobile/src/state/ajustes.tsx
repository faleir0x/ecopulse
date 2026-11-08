/** Preferências do usuário (Ajustes), persistidas no aparelho. */
import Storage from 'expo-sqlite/kv-store';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { TIPOS_RISCO, SEVERIDADES, type Severidade, type TipoRisco } from '@/domain/tipos';

export const RAIOS_M = [500, 1000, 2000] as const;
export type RaioM = (typeof RAIOS_M)[number];

export type Ajustes = {
  raioM: RaioM;
  /** Avisar a partir deste nível (inclusive). */
  limiar: Severidade;
  tiposAtivos: TipoRisco[];
  onboardingConcluido: boolean;
};

const CHAVE = 'ajustes.v1';
export const PADRAO: Ajustes = {
  raioM: 1000,
  limiar: 'moderado',
  tiposAtivos: [...TIPOS_RISCO],
  onboardingConcluido: false,
};

/** Lê com validação: valores fora do domínio voltam ao padrão (ex.: app atualizado). */
export function lerAjustes(bruto: string | null): Ajustes {
  if (!bruto) return PADRAO;
  try {
    const v = JSON.parse(bruto) as Partial<Ajustes>;
    return {
      raioM: RAIOS_M.includes(v.raioM as RaioM) ? (v.raioM as RaioM) : PADRAO.raioM,
      limiar: SEVERIDADES.includes(v.limiar as Severidade) ? (v.limiar as Severidade) : PADRAO.limiar,
      tiposAtivos: Array.isArray(v.tiposAtivos)
        ? v.tiposAtivos.filter((t): t is TipoRisco => TIPOS_RISCO.includes(t as TipoRisco))
        : PADRAO.tiposAtivos,
      onboardingConcluido: v.onboardingConcluido === true,
    };
  } catch {
    return PADRAO;
  }
}

type Contexto = Ajustes & { atualizar: (parcial: Partial<Ajustes>) => void };
const AjustesContext = createContext<Contexto | null>(null);

export function AjustesProvider({ children, inicial }: { children: ReactNode; inicial?: Ajustes }) {
  const [ajustes, setAjustes] = useState<Ajustes>(() => {
    if (inicial) return inicial;
    try {
      return lerAjustes(Storage.getItemSync(CHAVE));
    } catch {
      return PADRAO;
    }
  });

  const atualizar = useCallback((parcial: Partial<Ajustes>) => {
    setAjustes((atual) => {
      const novo = { ...atual, ...parcial };
      try {
        Storage.setItemSync(CHAVE, JSON.stringify(novo));
      } catch {
        // Sem persistência os ajustes valem só nesta sessão
      }
      return novo;
    });
  }, []);

  const valor = useMemo(() => ({ ...ajustes, atualizar }), [ajustes, atualizar]);
  return <AjustesContext.Provider value={valor}>{children}</AjustesContext.Provider>;
}

export function useAjustes(): Contexto {
  const valor = useContext(AjustesContext);
  if (!valor) throw new Error('useAjustes fora do AjustesProvider');
  return valor;
}
