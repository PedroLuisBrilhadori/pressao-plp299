#!/usr/bin/env node
/* gerar-cidades.mjs — gera js/cidades.js com os municípios das 27 UFs
 * a partir da API pública do IBGE (servicodados.ibge.gov.br, sem chave).
 *
 * Modo padrão:  node scripts/gerar-cidades.mjs           → reescreve js/cidades.js
 * Modo check:   node scripts/gerar-cidades.mjs --check   → compara com cidades.js atual,
 *                 exit 0 se igual, exit 1 se divergiu, exit 2 se pré-requisito ausente.
 *
 * PLANO:
 *   [1/3] Buscar municípios de cada UF (IBGE, ordem alfabética)
 *   [2/3] Validar cobertura (27 UFs, todas com municípios)
 *   [3/3] Escrever ou comparar js/cidades.js
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CHECK = process.argv.includes('--check');
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALVO = join(RAIZ, 'js', 'cidades.js');

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function falhaPreRequisito(msg) {
  console.error(`[ERRO] ${msg}`);
  process.exit(2);
}

console.log('PLANO: [1/3] municípios por UF (IBGE) · [2/3] validar · [3/3] ' + (CHECK ? 'comparar' : 'escrever') + ' cidades.js');

// [1/3]
console.log('[1/3] Buscando municípios das 27 UFs (servicodados.ibge.gov.br)…');
const cidades = {};
for (const uf of UFS) {
  const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios`, {
    signal: AbortSignal.timeout(30_000)
  });
  if (!res.ok) falhaPreRequisito(`IBGE ${uf}: HTTP ${res.status}`);
  const dados = await res.json();
  cidades[uf] = dados.map((m) => m.nome).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  process.stdout.write(`  ${uf}: ${cidades[uf].length} municípios\n`);
}

// [2/3]
const ufsVazias = UFS.filter((uf) => !cidades[uf].length);
if (ufsVazias.length) {
  falhaPreRequisito(`UFs sem municípios: ${ufsVazias.join(', ')}`);
}
const total = UFS.reduce((acc, uf) => acc + cidades[uf].length, 0);
if (total < 5500 || total > 5700) {
  falhaPreRequisito(`Total de municípios fora da faixa esperada: ${total} (esperado ~5570)`);
}
if (cidades.SP.length !== 645) {
  falhaPreRequisito(`SP tem ${cidades.SP.length} municípios (esperado 645) — dados suspeitos.`);
}

// [3/3]
const novo = 'window.CIDADES = ' + JSON.stringify(cidades) + ';\n';

if (!CHECK) {
  writeFileSync(ALVO, novo);
  console.log(`[3/3] cidades.js escrito: ${total} municípios em ${UFS.length} UFs.`);
  process.exit(0);
}

console.log('[3/3] Modo --check: comparando com cidades.js atual…');
if (!existsSync(ALVO)) {
  console.error('[CHECK] cidades.js não existe.');
  process.exit(1);
}
const atual = readFileSync(ALVO, 'utf8');
if (atual === novo) {
  console.log('[CHECK] cidades.js coerente com o IBGE.');
  process.exit(0);
}
console.error('[CHECK] cidades.js DIVERGIU do IBGE — rode "node scripts/gerar-cidades.mjs" para atualizar.');
process.exit(1);
