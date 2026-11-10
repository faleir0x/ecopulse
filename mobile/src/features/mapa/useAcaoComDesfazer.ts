import { useCallback, useEffect, useRef, useState } from 'react';

export type AcaoComDesfazer<T> = {
  /** Ação agendada aguardando a janela de desfazer; `null` quando não há nenhuma. */
  pendente: T | null;
  /** Agenda a ação (substituindo a pendente anterior, que é efetivada antes). */
  agendar: (acao: T) => void;
  /** Cancela a ação pendente sem efetivá-la. */
  desfazer: () => void;
  /** Efetiva a ação pendente agora (ao fechar o detalhe ou sair da tela). */
  efetivarAgora: () => void;
};

/**
 * Janela de desfazer para ações que só devem ir ao servidor depois de alguns segundos.
 * Ao desmontar, a ação pendente é efetivada (sair da tela não perde a resposta).
 */
export function useAcaoComDesfazer<T>(
  janelaMs: number,
  efetivar: (acao: T) => void,
): AcaoComDesfazer<T> {
  const [pendente, setPendente] = useState<T | null>(null);
  // O valor fica envolvido para distinguir "sem pendente" de uma ação T que valha null
  const acaoRef = useRef<{ valor: T } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const efetivarRef = useRef(efetivar);

  // Mantém o callback mais recente sem reiniciar timers a cada render
  useEffect(() => {
    efetivarRef.current = efetivar;
  }, [efetivar]);

  const cancelarTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const efetivarAgora = useCallback(() => {
    const acao = acaoRef.current;
    acaoRef.current = null;
    cancelarTimer();
    setPendente(null);
    if (acao) efetivarRef.current(acao.valor);
  }, [cancelarTimer]);

  const agendar = useCallback(
    (acao: T) => {
      // Trocar de ação efetiva a anterior primeiro: não perde nem duplica voto
      efetivarAgora();
      acaoRef.current = { valor: acao };
      setPendente(acao);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        acaoRef.current = null;
        setPendente(null);
        efetivarRef.current(acao);
      }, janelaMs);
    },
    [efetivarAgora, janelaMs],
  );

  const desfazer = useCallback(() => {
    acaoRef.current = null;
    cancelarTimer();
    setPendente(null);
  }, [cancelarTimer]);

  // Sair da tela com ação pendente: envia na hora em vez de perder a resposta
  useEffect(() => efetivarAgora, [efetivarAgora]);

  return { pendente, agendar, desfazer, efetivarAgora };
}
