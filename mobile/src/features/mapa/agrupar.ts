/** Agrupamento dos marcadores que ficariam a menos de ~56 dp um do outro na tela. */

import { SEVERIDADES, type Ocorrencia, type Severidade } from '@/domain/tipos';

export type Grupo = {
  chave: string;
  ocorrencias: Ocorrencia[];
  latitude: number;
  longitude: number;
  pior: Severidade;
};

type Regiao = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/** Célula da grade em dp: marcadores mais próximos que isso viram grupo. */
const TAMANHO_CELULA_DP = 56;

/** Zoom de rua: marcadores já estão separados o bastante, não agrupa. */
const ZOOM_MINIMO_AGRUPAR = 0.004;

function criarGrupo(membros: Ocorrencia[]): Grupo {
  let latitude = 0;
  let longitude = 0;
  let pior: Severidade = 'baixo';

  for (const ocorrencia of membros) {
    latitude += ocorrencia.latitude;
    longitude += ocorrencia.longitude;
    if (SEVERIDADES.indexOf(ocorrencia.severidade) > SEVERIDADES.indexOf(pior)) {
      pior = ocorrencia.severidade;
    }
  }

  const quantidade = membros.length;
  const chave = membros
    .map((ocorrencia) => ocorrencia.id)
    .sort((a, b) => a - b)
    .join('-');

  return {
    chave,
    ocorrencias: membros,
    latitude: latitude / quantidade,
    longitude: longitude / quantidade,
    pior,
  };
}

export function agrupar(
  ocorrencias: Ocorrencia[],
  regiao: Regiao,
  larguraTelaDp: number,
  fixos: ReadonlySet<number>,
): { soltos: Ocorrencia[]; grupos: Grupo[] } {
  if (regiao.longitudeDelta < ZOOM_MINIMO_AGRUPAR || larguraTelaDp <= 0) {
    return { soltos: [...ocorrencias], grupos: [] };
  }

  // 56 dp em graus de longitude; em latitude o mesmo trecho em graus × cos(lat) mantém o quadrado
  const tamLon = (regiao.longitudeDelta / larguraTelaDp) * TAMANHO_CELULA_DP;
  const tamLat = tamLon * Math.cos((regiao.latitude * Math.PI) / 180);
  if (tamLon <= 0 || tamLat <= 0) {
    return { soltos: [...ocorrencias], grupos: [] };
  }

  // Por distância na tela, não por grade: dois marcadores colados nunca ficam separados por
  // cair em células vizinhas. Ordem por id = resultado estável; não depende da câmera
  const candidatos = ocorrencias
    .filter((ocorrencia) => !fixos.has(ocorrencia.id))
    .sort((a, b) => a.id - b.id);
  const usados = new Set<number>();
  const grupos: Grupo[] = [];
  const agrupados = new Set<number>();
  for (const semente of candidatos) {
    if (usados.has(semente.id)) continue;
    usados.add(semente.id);
    const membros = [semente];
    for (const outra of candidatos) {
      if (usados.has(outra.id)) continue;
      const dx = (outra.longitude - semente.longitude) / tamLon;
      const dy = (outra.latitude - semente.latitude) / tamLat;
      if (dx * dx + dy * dy < 1) {
        usados.add(outra.id);
        membros.push(outra);
      }
    }
    if (membros.length < 2) continue;
    for (const ocorrencia of membros) agrupados.add(ocorrencia.id);
    grupos.push(criarGrupo(membros));
  }

  return {
    soltos: ocorrencias.filter((ocorrencia) => !agrupados.has(ocorrencia.id)),
    grupos,
  };
}
