const RAIO_TERRA_M = 6_371_000;

function emRadianos(graus: number): number {
  return (graus * Math.PI) / 180;
}

function emGraus(radianos: number): number {
  return (radianos * 180) / Math.PI;
}

/** Distância em metros (haversine, raio 6 371 000 m). */
export function distanciaM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = emRadianos(lat2 - lat1);
  const dLon = emRadianos(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(emRadianos(lat1)) * Math.cos(emRadianos(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * RAIO_TERRA_M * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

/** Rumo inicial em graus [0, 360), 0 = norte. */
export function rumoGraus(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const lat1Rad = emRadianos(lat1);
  const lat2Rad = emRadianos(lat2);
  const dLon = emRadianos(lon2 - lon1);

  const y = Math.sin(dLon) * Math.cos(lat2Rad);
  const x =
    Math.cos(lat1Rad) * Math.sin(lat2Rad) -
    Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
  const rumo = emGraus(Math.atan2(y, x));
  return ((rumo % 360) + 360) % 360;
}

/** "80 m", "950 m", "1,2 km", "12 km" (pt-BR, vírgula decimal; < 1 km arredonda a 10 m). */
export function formatarDistancia(metros: number): string {
  const valor = Math.max(0, metros);
  if (valor < 1000) {
    return `${Math.round(valor / 10) * 10} m`;
  }

  const quilometros = valor / 1000;
  if (quilometros < 10) {
    // "1 km" em vez de "1,0 km"
    return `${quilometros.toFixed(1).replace(/\.0$/, '').replace('.', ',')} km`;
  }
  return `${Math.round(quilometros)} km`;
}

/** "N", "NE", "L", "SE", "S", "SO", "O", "NO". */
export function direcao(graus: number): string {
  const setores = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  const normalizado = ((graus % 360) + 360) % 360;
  const indice = Math.round(normalizado / 45) % setores.length;
  return setores[indice]!;
}
