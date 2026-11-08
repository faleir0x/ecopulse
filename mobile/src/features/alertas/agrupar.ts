import type { ItemAlerta } from './regras';

export const ROTULOS_GRUPO = ['Hoje', 'Ontem', 'Antes'] as const;
export type RotuloGrupo = (typeof ROTULOS_GRUPO)[number];

export type GrupoAlertas = {
  rotulo: RotuloGrupo;
  itens: ItemAlerta[];
};

function chaveDia(data: Date): string {
  return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`;
}

/** Agrupa por dia local (Hoje, Ontem, Antes) preservando a ordem recebida. */
export function agruparAlertas(alertas: readonly ItemAlerta[], agora: Date = new Date()): GrupoAlertas[] {
  const ontem = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1);
  const chaveHoje = chaveDia(agora);
  const chaveOntem = chaveDia(ontem);

  const grupos = new Map<RotuloGrupo, ItemAlerta[]>([
    ['Hoje', []],
    ['Ontem', []],
    ['Antes', []],
  ]);

  for (const alerta of alertas) {
    const data = new Date(alerta.recebidoEm);
    const chave = Number.isNaN(data.getTime()) ? null : chaveDia(data);
    const rotulo: RotuloGrupo =
      chave === chaveHoje ? 'Hoje' : chave === chaveOntem ? 'Ontem' : 'Antes';
    grupos.get(rotulo)?.push(alerta);
  }

  return ROTULOS_GRUPO.map((rotulo) => ({ rotulo, itens: grupos.get(rotulo) ?? [] })).filter(
    (grupo) => grupo.itens.length > 0,
  );
}
