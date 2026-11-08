import { useEffect, useMemo, useState } from 'react';
import { Polyline } from 'react-native-maps';

import type { RotaSegura } from '@/domain/tipos';
import { useTema } from '@/theme/tema';

export type RotaLinhasProps = {
  rota: RotaSegura;
  /** Linha pontilhada da direta (só no resultado, quando houve desvio). */
  mostrarDireta: boolean;
};

const DURACAO_DESENHO_MS = 560;

function paraCoordenadas(pontos: [number, number][]) {
  return pontos.map(([latitude, longitude]) => ({ latitude, longitude }));
}

/** Polylines da rota (filhas do MapView). */
export function RotaLinhas({ rota, mostrarDireta }: RotaLinhasProps) {
  const { cor, reduzirMovimento } = useTema();
  const segura = useMemo(() => paraCoordenadas(rota.coordenadas), [rota.coordenadas]);
  const direta = useMemo(
    () => (rota.direta ? paraCoordenadas(rota.direta.coordenadas) : []),
    [rota.direta],
  );
  const [progresso, setProgresso] = useState<{ rota: RotaSegura; quantidade: number }>(() => ({
    rota,
    quantidade: Math.min(2, segura.length),
  }));
  const quantidade =
    reduzirMovimento || segura.length <= 2 || progresso.rota !== rota
      ? segura.length
      : progresso.quantidade;

  useEffect(() => {
    const total = segura.length;
    if (reduzirMovimento || total <= 2) return;

    let frame = 0;
    let cancelado = false;
    const inicio = Date.now();

    const passo = () => {
      if (cancelado) return;
      const t = Math.min(1, (Date.now() - inicio) / DURACAO_DESENHO_MS);
      const suave = 1 - (1 - t) ** 3;
      setProgresso({ rota, quantidade: Math.max(2, Math.ceil(suave * total)) });
      if (t < 1) frame = requestAnimationFrame(passo);
    };

    frame = requestAnimationFrame(passo);
    return () => {
      cancelado = true;
      cancelAnimationFrame(frame);
    };
  }, [rota, segura, reduzirMovimento]);

  if (segura.length < 2) return null;

  return (
    <>
      {mostrarDireta && direta.length >= 2 ? (
        <Polyline
          coordinates={direta}
          strokeColor={cor.textTertiary}
          strokeWidth={4}
          lineCap="round"
          lineJoin="round"
          lineDashPattern={[2, 10]}
          zIndex={1}
        />
      ) : null}
      <Polyline
        coordinates={segura.slice(0, quantidade)}
        strokeColor={cor.ink}
        strokeWidth={6}
        lineCap="round"
        lineJoin="round"
        zIndex={2}
      />
    </>
  );
}
