/**
 * PNG RGBA 8 bits em data URI, para o Overlay do mapa. O app não tem zlib: o fluxo deflate
 * usa blocos "stored" (sem compressão), o que basta para imagens de poucos KB.
 */

/** CRC-32 (polinômio 0xEDB88320) dos bytes, como o PNG exige em cada chunk. */
export function crc32(bytes: Uint8Array): number {
  // TODO(worker)
  throw new Error('não implementado');
}

/** Base64 padrão (com "=") sem depender de btoa. */
export function base64(bytes: Uint8Array): string {
  // TODO(worker)
  throw new Error('não implementado');
}

/** `rgba` tem largura × altura × 4 bytes, linha a linha de cima para baixo. */
export function pngDataUri(largura: number, altura: number, rgba: Uint8Array): string {
  // TODO(worker)
  throw new Error('não implementado');
}
