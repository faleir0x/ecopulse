/**
 * PNG RGBA 8 bits em data URI, para o Overlay do mapa. O app não tem zlib: o fluxo deflate
 * usa blocos "stored" (sem compressão), o que basta para imagens de poucos KB.
 */

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ALFABETO_BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const TAMANHO_MAX_BLOCO_DEFLATE = 65535;
const MODULO_ADLER = 65521;

const TABELA_CRC32 = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < tabela.length; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

function adicionarUint32BE(destino: number[], valor: number): void {
  destino.push(
    (valor >>> 24) & 0xff,
    (valor >>> 16) & 0xff,
    (valor >>> 8) & 0xff,
    valor & 0xff,
  );
}

function concatenar(destino: number[], origem: ArrayLike<number>): void {
  for (let i = 0; i < origem.length; i += 1) {
    destino.push(origem[i]!);
  }
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    a = (a + bytes[i]!) % MODULO_ADLER;
    b = (b + a) % MODULO_ADLER;
  }
  return ((b << 16) | a) >>> 0;
}

/** Fluxo zlib com blocos deflate "stored", como o PNG exige para o IDAT. */
function fluxoZlib(dados: Uint8Array): Uint8Array {
  const saida: number[] = [0x78, 0x01];

  for (let inicio = 0; inicio < dados.length; inicio += TAMANHO_MAX_BLOCO_DEFLATE) {
    const fim = Math.min(inicio + TAMANHO_MAX_BLOCO_DEFLATE, dados.length);
    const tamanho = fim - inicio;
    const final = fim === dados.length;
    saida.push(
      final ? 0x01 : 0x00,
      tamanho & 0xff,
      (tamanho >>> 8) & 0xff,
      (~tamanho) & 0xff,
      ((~tamanho) >>> 8) & 0xff,
    );
    for (let i = inicio; i < fim; i += 1) {
      saida.push(dados[i]!);
    }
  }

  const assinatura = adler32(dados);
  saida.push(
    (assinatura >>> 24) & 0xff,
    (assinatura >>> 16) & 0xff,
    (assinatura >>> 8) & 0xff,
    assinatura & 0xff,
  );

  return Uint8Array.from(saida);
}

function criarChunk(tipo: string, dados: Uint8Array): number[] {
  const corpo = new Uint8Array(4 + dados.length);
  for (let i = 0; i < 4; i += 1) {
    corpo[i] = tipo.charCodeAt(i);
  }
  corpo.set(dados, 4);

  const saida: number[] = [];
  adicionarUint32BE(saida, dados.length);
  concatenar(saida, corpo);
  adicionarUint32BE(saida, crc32(corpo));
  return saida;
}

/** CRC-32 (polinômio 0xEDB88320) dos bytes, como o PNG exige em cada chunk. */
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = TABELA_CRC32[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Base64 padrão (com "=") sem depender de btoa. */
export function base64(bytes: Uint8Array): string {
  const partes: string[] = [];

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];

    partes.push(ALFABETO_BASE64[b0 >> 2]!);
    if (b1 === undefined) {
      partes.push(ALFABETO_BASE64[(b0 & 0x03) << 4]!, '==');
      break;
    }

    partes.push(ALFABETO_BASE64[((b0 & 0x03) << 4) | (b1 >> 4)]!);
    if (b2 === undefined) {
      partes.push(ALFABETO_BASE64[(b1 & 0x0f) << 2]!, '=');
      break;
    }

    partes.push(
      ALFABETO_BASE64[((b1 & 0x0f) << 2) | (b2 >> 6)]!,
      ALFABETO_BASE64[b2 & 0x3f]!,
    );
  }

  return partes.join('');
}

/** `rgba` tem largura × altura × 4 bytes, linha a linha de cima para baixo. */
export function pngDataUri(largura: number, altura: number, rgba: Uint8Array): string {
  if (!Number.isInteger(largura) || !Number.isInteger(altura) || largura < 1 || altura < 1) {
    throw new RangeError(`dimensões inválidas: ${largura}×${altura}`);
  }
  if (rgba.length !== largura * altura * 4) {
    throw new RangeError(
      `rgba deveria ter ${largura * altura * 4} bytes, recebeu ${rgba.length}`,
    );
  }

  const bytesPorLinha = largura * 4;
  const cru = new Uint8Array(altura * (1 + bytesPorLinha));
  for (let linha = 0; linha < altura; linha += 1) {
    const inicio = linha * (1 + bytesPorLinha);
    cru[inicio] = 0; // filtro "None"
    cru.set(rgba.subarray(linha * bytesPorLinha, (linha + 1) * bytesPorLinha), inicio + 1);
  }

  const ihdr = new Uint8Array(13);
  const escritor = new DataView(ihdr.buffer);
  escritor.setUint32(0, largura);
  escritor.setUint32(4, altura);
  ihdr[8] = 8; // profundidade
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compressão
  ihdr[11] = 0; // filtro
  ihdr[12] = 0; // entrelaçamento

  const arquivo: number[] = [...ASSINATURA_PNG];
  concatenar(arquivo, criarChunk('IHDR', ihdr));
  concatenar(arquivo, criarChunk('IDAT', fluxoZlib(cru)));
  concatenar(arquivo, criarChunk('IEND', new Uint8Array(0)));

  return `data:image/png;base64,${base64(Uint8Array.from(arquivo))}`;
}
