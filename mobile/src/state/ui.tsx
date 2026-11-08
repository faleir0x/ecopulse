import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/** Estado de interface compartilhado entre telas e a tab bar. */
type Ui = {
  /** Detalhe de ocorrência aberto: a tab bar desce e as ações ficam no rodapé da sheet. */
  modoFoco: boolean;
  setModoFoco: (ativo: boolean) => void;
};

const UiContext = createContext<Ui>({ modoFoco: false, setModoFoco: () => undefined });

export function UiProvider({ children }: { children: ReactNode }) {
  const [modoFoco, setModoFoco] = useState(false);
  const valor = useMemo(() => ({ modoFoco, setModoFoco }), [modoFoco]);
  return <UiContext.Provider value={valor}>{children}</UiContext.Provider>;
}

export function useUi(): Ui {
  return useContext(UiContext);
}
