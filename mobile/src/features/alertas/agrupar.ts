import type { ItemAlerta } from './regras';

export type DiaAlertas = {
  /** "aaaa-m-d" no fuso local; estável para a seleção do dia. */
  chave: string;
  /** "Hoje", "Ontem", "sex 6" (na semana) ou "6 nov" (mais antigo). */
  rotulo: string;
  itens: ItemAlerta[];
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Dias que sempre aparecem (mesmo sem alerta), contando hoje. */
export const DIAS_VISIVEIS = 7;

function chaveDia(data: Date): string {
  return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`;
}

/**
 * Separa por dia local, do mais recente ao mais antigo, preservando a ordem recebida dentro de
 * cada dia. Os últimos DIAS_VISIVEIS dias aparecem sempre (vazios também, para dar para voltar
 * no tempo); dias mais antigos só se tiverem alerta. Datas inválidas ficam fora.
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

  const rotular = (chave: string, data: Date, naSemana: boolean): string =>
    chave === chaveHoje
      ? 'Hoje'
      : chave === chaveOntem
        ? 'Ontem'
        : naSemana
          ? `${SEMANA[data.getDay()]} ${data.getDate()}`
          : `${data.getDate()} ${MESES[data.getMonth()]}`;

  const resultado: DiaAlertas[] = [];
  for (let i = 0; i < DIAS_VISIVEIS; i += 1) {
    const data = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - i);
    const chave = chaveDia(data);
    resultado.push({ chave, rotulo: rotular(chave, data, true), itens: dias.get(chave)?.itens ?? [] });
    dias.delete(chave);
  }
  const antigos = [...dias.entries()].sort(([, a], [, b]) => b.data.getTime() - a.data.getTime());
  for (const [chave, { data, itens }] of antigos) {
    resultado.push({ chave, rotulo: rotular(chave, data, false), itens });
  }
  return resultado;
}
