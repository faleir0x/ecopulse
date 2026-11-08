import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/** Estado de interface compartilhado entre telas e a tab bar. */
type Ui = {
  /** Detalhe de ocorrência aberto: a tab bar desce e as ações ficam no rodapé da sheet. */
  modoFoco: boolean;
  setModoFoco: (ativo: boolean) => void;
  /** Sheet de relato (botão + da tab bar). */
  relatarAberto: boolean;
  setRelatarAberto: (aberto: boolean) => void;
  /** Ocorrência a abrir no Mapa (toque num alerta ou notificação); o Mapa consome e zera. */
  ocorrenciaFoco: number | null;
  setOcorrenciaFoco: (id: number | null) => void;
};

const UiContext = createContext<Ui>({
  modoFoco: false,
  setModoFoco: () => undefined,
  relatarAberto: false,
  setRelatarAberto: () => undefined,
  ocorrenciaFoco: null,
  setOcorrenciaFoco: () => undefined,
});

export function UiProvider({ children }: { children: ReactNode }) {
  const [modoFoco, setModoFoco] = useState(false);
  const [relatarAberto, setRelatarAberto] = useState(false);
  const [ocorrenciaFoco, setOcorrenciaFoco] = useState<number | null>(null);
  const valor = useMemo(
    () => ({ modoFoco, setModoFoco, relatarAberto, setRelatarAberto, ocorrenciaFoco, setOcorrenciaFoco }),
    [modoFoco, relatarAberto, ocorrenciaFoco],
  );
  return <UiContext.Provider value={valor}>{children}</UiContext.Provider>;
}

export function useUi(): Ui {
  return useContext(UiContext);
}
