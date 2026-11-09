import { inflateSync } from 'zlib';

import { base64, crc32, pngDataUri } from './png';

type ChunkPng = { tipo: string; dados: Buffer };

const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function bytesDeTexto(texto: string): Uint8Array {
  return Uint8Array.from([...texto].map((caractere) => caractere.charCodeAt(0)));
}

function chunksDoPng(bytes: Buffer): ChunkPng[] {
  const chunks: ChunkPng[] = [];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const tamanho = bytes.readUInt32BE(offset);
    const tipo = bytes.toString('ascii', offset + 4, offset + 8);
    chunks.push({ tipo, dados: bytes.subarray(offset + 8, offset + 8 + tamanho) });
    offset += 12 + tamanho;
  }
  return chunks;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function bytesDoDataUri(uri: string): Buffer {
  return Buffer.from(uri.slice('data:image/png;base64,'.length), 'base64');
}

describe('crc32', () => {
  it('calcula o CRC do chunk IEND', () => {
    expect(crc32(bytesDeTexto('IEND'))).toBe(0xae426082);
  });
});

describe('base64', () => {
  it.each([
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foobar', 'Zm9vYmFy'],
  ])('codifica %j como %j (RFC 4648)', (texto, esperado) => {
    expect(base64(bytesDeTexto(texto))).toBe(esperado);
  });
});

describe('pngDataUri', () => {
  it('monta um PNG 1×1 com assinatura e IHDR corretos', () => {
    const uri = pngDataUri(1, 1, new Uint8Array([255, 0, 0, 255]));

    expect(uri.startsWith('data:image/png;base64,')).toBe(true);

    const bytes = bytesDoDataUri(uri);
    expect([...bytes.subarray(0, 8)]).toEqual(ASSINATURA_PNG);

    const chunks = chunksDoPng(bytes);
    const ihdr = chunks[0]!;
    expect(ihdr.tipo).toBe('IHDR');
    expect(ihdr.dados.readUInt32BE(0)).toBe(1);
    expect(ihdr.dados.readUInt32BE(4)).toBe(1);
    expect([...ihdr.dados.subarray(8)]).toEqual([8, 6, 0, 0, 0]);
    expect(chunks[chunks.length - 1]!.tipo).toBe('IEND');
  });

  it('quebra os dados crus em blocos stored de até 65535 bytes', () => {
    const largura = 200;
    const altura = 100;
    const rgba = new Uint8Array(largura * altura * 4);
    for (let i = 0; i < rgba.length; i += 1) {
      rgba[i] = (i * 37) % 256;
    }

    const bytes = bytesDoDataUri(pngDataUri(largura, altura, rgba));
    const idat = chunksDoPng(bytes).find((chunk) => chunk.tipo === 'IDAT')!.dados;

    expect(idat[0]).toBe(0x78);
    expect(idat[1]).toBe(0x01);

    // Primeiro bloco stored: BFINAL=0, LEN=65535.
    expect(idat[2]).toBe(0x00);
    expect(idat.readUInt16LE(3)).toBe(65535);
    expect(idat.readUInt16LE(5)).toBe(0);

    const inicioSegundo = 7 + 65535;
    const tamanhoSegundo = idat.readUInt16LE(inicioSegundo + 1);
    expect(idat[inicioSegundo]).toBe(0x01);
    expect(tamanhoSegundo).toBe(altura * (1 + largura * 4) - 65535);
    expect(idat.length).toBe(inicioSegundo + 5 + tamanhoSegundo + 4);

    const bytesPorLinha = largura * 4;
    const cru = new Uint8Array(altura * (1 + bytesPorLinha));
    for (let linha = 0; linha < altura; linha += 1) {
      const inicio = linha * (1 + bytesPorLinha);
      cru.set(rgba.subarray(linha * bytesPorLinha, (linha + 1) * bytesPorLinha), inicio + 1);
    }

    expect(idat.readUInt32BE(idat.length - 4)).toBe(adler32(cru));
    expect(inflateSync(idat).equals(Buffer.from(cru))).toBe(true);
  });

  it('rejeita dimensões inválidas e tamanho de rgba errado', () => {
    expect(() => pngDataUri(2, 2, new Uint8Array(15))).toThrow();
    expect(() => pngDataUri(0, 1, new Uint8Array(0))).toThrow();
    expect(() => pngDataUri(1, 0, new Uint8Array(0))).toThrow();
  });
});
