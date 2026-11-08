/** Ordenação e filtragem das ocorrências (severidade desc, depois distância asc). */

import { SEVERIDADES, type Ocorrencia } from '@/domain/tipos';
import { distanciaM } from '@/lib/distancia';

export type Origem = { latitude: number; longitude: number };

/** Ocorrências dentro do raio, ordenadas por severidade (decrescente) e distância (crescente). */
export function ordenarPorSeveridadeEDistancia(lista: Ocorrencia[], origem: Origem): Ocorrencia[] {
  return lista
    .map((ocorrencia) => ({
      ocorrencia,
      distancia: distanciaM(
        origem.latitude,
        origem.longitude,
        ocorrencia.latitude,
        ocorrencia.longitude,
      ),
    }))
    .sort((a, b) => {
      const severidade = SEVERIDADES.indexOf(b.ocorrencia.severidade) - SEVERIDADES.indexOf(a.ocorrencia.severidade);
      return severidade !== 0 ? severidade : a.distancia - b.distancia;
    })
    .map((item) => item.ocorrencia);
}

/** Filtra e ordena as ocorrências dentro de `raioM` a partir de `origem`. */
export function ocorrenciasNoRaio(lista: Ocorrencia[], origem: Origem, raioM: number): Ocorrencia[] {
  const dentro = lista.filter(
    (ocorrencia) =>
      distanciaM(origem.latitude, origem.longitude, ocorrencia.latitude, ocorrencia.longitude) <= raioM,
  );
  return ordenarPorSeveridadeEDistancia(dentro, origem);
}
