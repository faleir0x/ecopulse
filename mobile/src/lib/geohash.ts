/** GeoHash (mesmo algoritmo de packages/common/src/ecopulse_common/geohash.py). */
import { distanciaM } from './distancia';

export const PRECISAO_CELULA = 6;
export const MAX_CELULAS_ASSINATURA = 50; // limite do servidor realtime

export type Bbox = { latMin: number; lonMin: number; latMax: number; lonMax: number };

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const LAT_MIN = -90;
const LAT_MAX = 90;
const LON_MIN = -180;
const LON_MAX = 180;
const RAIO_TERRA_M = 6_371_000;

function valido(geohash: string): boolean {
  return (
    typeof geohash === 'string' &&
    geohash.length > 0 &&
    [...geohash].every((caractere) => BASE32.includes(caractere))
  );
}

export function encode(lat: number, lon: number, precisao = PRECISAO_CELULA): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new RangeError('latitude e longitude devem ser finitas');
  }
  if (lat < LAT_MIN || lat > LAT_MAX) {
    throw new RangeError(`latitude fora de [-90, 90]: ${lat}`);
  }
  if (lon < LON_MIN || lon > LON_MAX) {
    throw new RangeError(`longitude fora de [-180, 180]: ${lon}`);
  }
  if (precisao < 1) {
    throw new RangeError(`precisão deve ser >= 1: ${precisao}`);
  }

  let latMin = LAT_MIN;
  let latMax = LAT_MAX;
  let lonMin = LON_MIN;
  let lonMax = LON_MAX;
  const resultado: string[] = [];
  let bits = 0;
  let valor = 0;
  let longitudeAgora = true;

  while (resultado.length < precisao) {
    if (longitudeAgora) {
      const meio = (lonMin + lonMax) / 2;
      if (lon >= meio) {
        valor = (valor << 1) | 1;
        lonMin = meio;
      } else {
        valor <<= 1;
        lonMax = meio;
      }
    } else {
      const meio = (latMin + latMax) / 2;
      if (lat >= meio) {
        valor = (valor << 1) | 1;
        latMin = meio;
      } else {
        valor <<= 1;
        latMax = meio;
      }
    }

    longitudeAgora = !longitudeAgora;
    bits += 1;
    if (bits === 5) {
      resultado.push(BASE32[valor]!);
      bits = 0;
      valor = 0;
    }
  }

  return resultado.join('');
}

export function decodeBbox(geohash: string): Bbox {
  if (!valido(geohash)) {
    throw new RangeError(`geohash inválido: ${JSON.stringify(geohash)}`);
  }

  let latMin = LAT_MIN;
  let latMax = LAT_MAX;
  let lonMin = LON_MIN;
  let lonMax = LON_MAX;
  let longitudeAgora = true;

  for (const caractere of geohash) {
    const indice = BASE32.indexOf(caractere);
    for (const mascara of [16, 8, 4, 2, 1]) {
      if (longitudeAgora) {
        const meio = (lonMin + lonMax) / 2;
        if (indice & mascara) {
          lonMin = meio;
        } else {
          lonMax = meio;
        }
      } else {
        const meio = (latMin + latMax) / 2;
        if (indice & mascara) {
          latMin = meio;
        } else {
          latMax = meio;
        }
      }
      longitudeAgora = !longitudeAgora;
    }
  }

  return { latMin, lonMin, latMax, lonMax };
}

/** 8 vizinhos na ordem N, NE, E, SE, S, SW, W, NW (omite fora dos polos). */
export function vizinhos(geohash: string): string[] {
  if (!valido(geohash)) {
    throw new RangeError(`geohash inválido: ${JSON.stringify(geohash)}`);
  }

  const { latMin, lonMin, latMax, lonMax } = decodeBbox(geohash);
  const latCentro = (latMin + latMax) / 2;
  const lonCentro = (lonMin + lonMax) / 2;
  const altura = latMax - latMin;
  const largura = lonMax - lonMin;
  const precisao = geohash.length;

  const deslocamentos: [number, number][] = [
    [altura, 0], // N
    [altura, largura], // NE
    [0, largura], // E
    [-altura, largura], // SE
    [-altura, 0], // S
    [-altura, -largura], // SW
    [0, -largura], // W
    [altura, -largura], // NW
  ];

  const resultado: string[] = [];
  for (const [deltaLat, deltaLon] of deslocamentos) {
    const lat = latCentro + deltaLat;
    let lon = lonCentro + deltaLon;

    if (lat < LAT_MIN || lat > LAT_MAX) {
      continue;
    }
    if (lon > LON_MAX) {
      lon -= 360;
    } else if (lon < LON_MIN) {
      lon += 360;
    }

    resultado.push(encode(lat, lon, precisao));
  }

  return resultado;
}

function distanciaAoCelula(lat: number, lon: number, geohash: string): number {
  const { latMin, lonMin, latMax, lonMax } = decodeBbox(geohash);
  const latPerto = Math.min(Math.max(lat, latMin), latMax);
  const lonPerto = Math.min(Math.max(lon, lonMin), lonMax);
  return distanciaM(lat, lon, latPerto, lonPerto);
}

/**
 * Células de `precisao` cuja área intersecta o círculo (centro, raioM). Inclui sempre a célula
 * do centro. Se passar de MAX_CELULAS_ASSINATURA, devolve as mais próximas do centro até o limite.
 */
export function celulasNoRaio(lat: number, lon: number, raioM: number, precisao = PRECISAO_CELULA): string[] {
  const celulaCentro = encode(lat, lon, precisao);
  const caixaCentro = decodeBbox(celulaCentro);
  const altura = caixaCentro.latMax - caixaCentro.latMin;
  const largura = caixaCentro.lonMax - caixaCentro.lonMin;

  const radianos = Math.PI / 180;
  const deltaLat = raioM / RAIO_TERRA_M / radianos;
  const cosseno = Math.cos(lat * radianos);
  const deltaLon =
    Math.abs(cosseno) < 1e-12
      ? 180
      : Math.min(180, raioM / (RAIO_TERRA_M * Math.abs(cosseno)) / radianos);

  const latMin = Math.max(LAT_MIN, lat - deltaLat);
  const latMax = Math.min(LAT_MAX, lat + deltaLat);
  const lonMin = lon - deltaLon;
  const lonMax = lon + deltaLon;

  const totalLat = Math.round((LAT_MAX - LAT_MIN) / altura);
  const totalLon = Math.round((LON_MAX - LON_MIN) / largura);
  const iMin = Math.max(0, Math.floor((latMin - LAT_MIN) / altura));
  const iMax = Math.min(totalLat - 1, Math.floor((latMax - LAT_MIN) / altura));
  const jMin = Math.floor((lonMin - LON_MIN) / largura);
  const jMax = Math.floor((lonMax - LON_MIN) / largura);

  const encontradas = new Set<string>();
  for (let i = iMin; i <= iMax; i += 1) {
    const latCelula = LAT_MIN + (i + 0.5) * altura;
    for (let j = jMin; j <= jMax; j += 1) {
      const jNormalizado = ((j % totalLon) + totalLon) % totalLon;
      const lonCelula = LON_MIN + (jNormalizado + 0.5) * largura;
      const geohash = encode(latCelula, lonCelula, precisao);
      if (encontradas.has(geohash)) {
        continue;
      }
      if (distanciaAoCelula(lat, lon, geohash) <= raioM) {
        encontradas.add(geohash);
      }
    }
  }

  if (!encontradas.has(celulaCentro)) {
    encontradas.add(celulaCentro);
  }

  const ordenadas = [...encontradas].sort(
    (a, b) => distanciaAoCelula(lat, lon, a) - distanciaAoCelula(lat, lon, b),
  );

  return ordenadas.slice(0, MAX_CELULAS_ASSINATURA);
}
