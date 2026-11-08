#!/usr/bin/env node
/**
 * Gera src/icons/solar/icones.ts a partir de @iconify-json/solar.
 * Lê ICONES e VARIANTES_EXTRAS de src/icons/index.ts e emite o XML SVG de cada
 * variante usada pelo app, mantendo currentColor para a prop `color` do SvgXml.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import * as solar from '@iconify-json/solar';
import { getIconData, iconToSVG } from '@iconify/utils';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arquivoFonte = resolve(raiz, 'src/icons/index.ts');
const arquivoSaida = resolve(raiz, 'src/icons/solar/icones.ts');

function lerLista(fonte, nome) {
  const bloco = fonte.match(new RegExp(`export const ${nome}\\b[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!bloco) throw new Error(`Não encontrei a lista ${nome} em ${arquivoFonte}`);
  return [...bloco[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function gerarSvg(chave) {
  const dados = getIconData(solar.icons, chave);
  if (!dados) return null;
  const { body } = iconToSVG(dados, { width: 24, height: 24 });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${body}</svg>`;
}

const fonte = await readFile(arquivoFonte, 'utf8');
const icones = lerLista(fonte, 'ICONES');
const extras = lerLista(fonte, 'VARIANTES_EXTRAS');

const variantes = [...new Set([...icones.map((nome) => `${nome}-linear`), ...extras])];

const entradas = [];
const ausentes = [];
for (const chave of variantes) {
  const svg = gerarSvg(chave);
  if (svg) entradas.push([chave, svg]);
  else ausentes.push(chave);
}

if (ausentes.length > 0) {
  console.error(`Ícones ausentes no Solar:\n- ${ausentes.join('\n- ')}`);
  process.exit(1);
}

const linhas = entradas.map(([chave, svg]) => `  ${JSON.stringify(chave)}: ${JSON.stringify(svg)},`);
const saida = `/* eslint-disable */
// Arquivo gerado por scripts/gerar-icones.mjs. Não edite à mão.

export const ICONES_SVG: Record<string, string> = {
${linhas.join('\n')}
};
`;

await mkdir(dirname(arquivoSaida), { recursive: true });
await writeFile(arquivoSaida, saida, 'utf8');
console.log(`Gerados ${entradas.length} ícones em ${arquivoSaida}`);
