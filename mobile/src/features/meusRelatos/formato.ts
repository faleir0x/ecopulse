export function formatarCoordenadas(latitude: number, longitude: number): string {
  return `${latitude.toFixed(4).replace('.', ',')}, ${longitude.toFixed(4).replace('.', ',')}`;
}
