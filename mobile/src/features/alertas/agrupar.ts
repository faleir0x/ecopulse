import type { ItemAlerta } from './regras';

export type DiaAlertas = {
  /** "aaaa-m-d" no fuso local; estável para a seleção do dia. */
  chave: string;
  /** "Hoje", "Ontem" ou "6 nov". */
  rotulo: string;
  itens: ItemAlerta[];
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function chaveDia(data: Date): string {
  return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`;
}

/**
 * Separa por dia local, do mais recente ao mais antigo, preservando a ordem recebida dentro de
 * cada dia. Só aparecem dias com alerta; datas inválidas ficam fora.
 */
export function agruparPorDia(alertas: readonly ItemAlerta[], agora: Date = new Date()): DiaAlertas[] {
  const ontem = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1);
  const chaveHoje = chaveDia(agora);
  const chaveOntem = chaveDia(ontem);

  const dias = new Map<string, { data: Date; itens: ItemAlerta[] }>();
  for (const alerta of alertas) {
    const data = new Date(alerta.recebidoEm);
    if (Number.isNaN(data.getTime())) continue;
    const chave = chaveDia(data);
    const dia = dias.get(chave);
    if (dia) dia.itens.push(alerta);
    else dias.set(chave, { data, itens: [alerta] });
  }

  return [...dias.entries()]
    .sort(([, a], [, b]) => b.data.getTime() - a.data.getTime())
    .map(([chave, { data, itens }]) => ({
      chave,
      rotulo:
        chave === chaveHoje
          ? 'Hoje'
          : chave === chaveOntem
            ? 'Ontem'
            : `${data.getDate()} ${MESES[data.getMonth()]}`,
      itens,
    }));
}
