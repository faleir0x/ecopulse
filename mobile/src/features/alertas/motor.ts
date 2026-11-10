/**
 * Motor puro de alertas: recebe o estado atual e a entrada (evento do WebSocket ou ocorrências
 * próximas), devolve o novo estado e os avisos que o provider deve notificar. Não conhece
 * Storage, notificações, silêncio nem WebSocket — quem chama é o adaptador (state/alertas.tsx).
 */
import type { Ocorrencia, Severidade, TipoRisco } from '@/domain/tipos';
import type { Alerta as EventoRealtime } from '@/realtime/cliente';

import { acrescentar, avaliar, avisarZona, type ItemAlerta } from './regras';
import { avaliarZonas, type Posicao } from './zona';

export type EstadoAlertas = {
  alertas: ItemAlerta[];
  /** Ids das ocorrências em cuja zona de influência o usuário está. */
  zonas: ReadonlySet<number>;
  /** Primeira avaliação já foi semeada em silêncio (evita rajada ao instalar/abrir). */
  zonasIniciadas: boolean;
};

export type Preferencias = {
  posicao: Posicao | null;
  raioM: number;
  limiar: Severidade;
  tiposAtivos: TipoRisco[];
};

export type Aviso = { item: ItemAlerta; origem: 'evento' | 'zona' };

export type Resultado = { estado: EstadoAlertas; avisos: Aviso[] };

/** Severidade já alertada por ocorrência, da mais antiga para a mais recente (a última vence). */
function severidadesAlertadas(alertas: ItemAlerta[]): Map<number, Severidade> {
  const jaAlertada = new Map<number, Severidade>();
  for (const a of [...alertas].reverse()) jaAlertada.set(a.ocorrencia.id, a.ocorrencia.severidade);
  return jaAlertada;
}

/**
 * Evento do WebSocket vira aviso quando: tipo ativo, dentro do raio, nível >= limiar e (é nova
 * OU piorou desde o último alerta). Sem aviso, devolve o mesmo estado.
 */
export function aoReceberEvento(
  estado: EstadoAlertas,
  evento: EventoRealtime,
  prefs: Preferencias,
  agora: Date,
): Resultado {
  const item = avaliar(
    evento,
    { ...prefs, jaAlertada: severidadesAlertadas(estado.alertas) },
    agora,
  );
  if (!item) return { estado, avisos: [] };
  return {
    estado: { ...estado, alertas: acrescentar(estado.alertas, item) },
    avisos: [{ item, origem: 'evento' }],
  };
}

/**
 * Reavalia as zonas de influência na posição atual. A primeira avaliação apenas semeia o
 * conjunto em silêncio; depois, entrar numa zona avisa (respeitando a janela de repetição) e
 * sair usa histerese. O silêncio de 1 h NÃO é decidido aqui (fica no provider).
 */
export function aoAvaliarZonas(
  estado: EstadoAlertas,
  ocorrencias: Ocorrencia[],
  prefs: Preferencias,
  agora: Date,
): Resultado {
  if (!prefs.posicao) return { estado, avisos: [] };

  const { entrou, dentro } = avaliarZonas(ocorrencias, prefs.posicao, estado.zonas, {
    limiar: prefs.limiar,
    tiposAtivos: prefs.tiposAtivos,
  });
  const semeado: EstadoAlertas = { ...estado, zonas: dentro, zonasIniciadas: true };

  // Primeira avaliação: semeia o conjunto em silêncio para não avisar em rajada
  if (!estado.zonasIniciadas) return { estado: semeado, avisos: [] };

  let alertas = estado.alertas;
  const avisos: Aviso[] = [];
  for (const { ocorrencia, distanciaM } of entrou) {
    if (!avisarZona(ocorrencia.id, estado.alertas, agora)) continue;
    const item: ItemAlerta = {
      chave: `zona:${ocorrencia.id}:${agora.getTime()}`,
      ocorrencia,
      distanciaM,
      recebidoEm: agora.toISOString(),
      lido: false,
    };
    alertas = acrescentar(alertas, item);
    avisos.push({ item, origem: 'zona' });
  }
  return { estado: { ...semeado, alertas }, avisos };
}
