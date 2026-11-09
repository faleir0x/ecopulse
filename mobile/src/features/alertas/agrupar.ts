import type { ItemAlerta } from './regras';

export type DiaAlertas = {
  /** "aaaa-m-d" no fuso local; estável para a seleção do dia. */
  chave: string;
  /** "Hoje", "Ontem" ou "sex 6 nov". */
  rotulo: string;
  itens: ItemAlerta[];
};

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Dias no seletor (mesmo sem alerta): hoje e os 3 anteriores. */
export const DIAS_VISIVEIS = 4;

function chaveDia(data: Date): string {
  return `${data.getFullYear()}-${data.getMonth()}-${data.getDate()}`;
}

/**
 * Separa por dia local, do mais recente ao mais antigo, preservando a ordem recebida dentro de
 * cada dia. Só os últimos DIAS_VISIVEIS dias (vazios também, para dar para voltar no tempo);
 * alertas mais antigos e datas inválidas ficam fora.
 */
export function agruparPorDia(
  alertas: readonly ItemAlerta[],
  agora: Date = new Date(),
): DiaAlertas[] {
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

  const rotular = (chave: string, data: Date): string =>
    chave === chaveHoje
      ? 'Hoje'
      : chave === chaveOntem
        ? 'Ontem'
        : `${SEMANA[data.getDay()]} ${data.getDate()} ${MESES[data.getMonth()]}`;

  const resultado: DiaAlertas[] = [];
  for (let i = 0; i < DIAS_VISIVEIS; i += 1) {
    const data = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - i);
    const chave = chaveDia(data);
    resultado.push({ chave, rotulo: rotular(chave, data), itens: dias.get(chave)?.itens ?? [] });
    dias.delete(chave);
  }
  return resultado;
}
