/**
 * Alerta de proximidade ao ENTRAR na zona de influência de uma ocorrência ativa (proposta,
 * seção IV: "notificações proativas quando o usuário entra na zona de influência").
 * Funções puras (testadas); o estado "dentro/fora" é guardado por quem chama.
 */
import { nivel, type Ocorrencia, type Severidade, type TipoRisco } from '@/domain/tipos';
import { distanciaM } from '@/lib/distancia';

/** Raio de influência por gravidade: quanto pior, mais longe vale avisar. */
export const RAIO_INFLUENCIA_M: Record<Severidade, number> = {
  baixo: 150,
  moderado: 300,
  alto: 500,
  critico: 800,
};

/** Histerese: só conta como "saiu" além de 120% do raio (evita avisos piscando na borda). */
export const FOLGA_SAIDA = 1.2;

export type Posicao = { latitude: number; longitude: number };

export type ResultadoZona = {
  /** Ocorrências em cuja zona o usuário acabou de entrar (avisar). */
  entrou: { ocorrencia: Ocorrencia; distanciaM: number }[];
  /** Conjunto atualizado de ids em cuja zona o usuário está. */
  dentro: Set<number>;
};

export function avaliarZonas(
  ocorrencias: Ocorrencia[],
  posicao: Posicao,
  dentroAntes: ReadonlySet<number>,
  filtro: { limiar: Severidade; tiposAtivos: TipoRisco[] },
): ResultadoZona {
  const dentro = new Set<number>();
  const entrou: ResultadoZona['entrou'] = [];
  for (const o of ocorrencias) {
    if (o.status !== 'ativa') continue;
    if (!filtro.tiposAtivos.includes(o.tipo)) continue;
    if (nivel(o.severidade) < nivel(filtro.limiar)) continue;
    const d = distanciaM(posicao.latitude, posicao.longitude, o.latitude, o.longitude);
    const raio = RAIO_INFLUENCIA_M[o.severidade];
    const estava = dentroAntes.has(o.id);
    if (d <= raio || (estava && d <= raio * FOLGA_SAIDA)) {
      dentro.add(o.id);
      if (!estava) entrou.push({ ocorrencia: o, distanciaM: d });
    }
  }
  return { entrou, dentro };
}
