import { useEffect, useState } from 'react';

/**
 * No Android o Marker com view customizada vira bitmap. Com tracksViewChanges={false} desde o
 * início, o bitmap é tirado antes do SVG e das bordas terminarem de desenhar (marcador cortado
 * ou deslocado). Mantém o redesenho ligado nos primeiros instantes e depois congela.
 */
export function useRedesenhoInicial(ms = 700): boolean {
  const [ativo, setAtivo] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setAtivo(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return ativo;
}
