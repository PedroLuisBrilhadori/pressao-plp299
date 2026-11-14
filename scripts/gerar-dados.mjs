#!/usr/bin/env node
/* gerar-dados.mjs — regenera js/data.js a partir das APIs públicas
 * da Câmara (dadosabertos.camara.leg.br) e do Senado (legis.senado.leg.br).
 *
 * Modo padrão:  node scripts/gerar-dados.mjs           → reescreve js/data.js
 * Modo check:   node scripts/gerar-dados.mjs --check   → compara com data.js atual,
 *                 exit 0 se igual (contagem + e-mails), exit 1 se divergiu, exit 2
 *                 se pré-requisito ausente (sem rede, API de fora do ar).
 *
 * PLANO:
 *   [1/4] Buscar deputados de SP em exercício (API Câmara, siglaUf=SP)
 *   [2/4] Buscar senadores de SP em exercício (API Senado, lista/atual)
 *   [3/4] Montar registros normalizados (nome, partido, email, pagina, casa)
 *   [4/4] Escrever ou comparar js/data.js
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CHECK = process.argv.includes('--check');
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALVO = join(RAIZ, 'js', 'data.js');

function falhaPreRequisito(msg) {
  console.error(`[ERRO] ${msg}`);
  process.exit(2);
}

async function buscarJson(url, descricao) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000)
  });
  if (!res.ok) falhaPreRequisito(`${descricao}: HTTP ${res.status}`);
  return res.json();
}

console.log('PLANO: [1/4] deputados SP · [2/4] senadores SP · [3/4] normalizar · [4/4] ' + (CHECK ? 'comparar' : 'escrever') + ' data.js');

// [1/4] deputados em exercício (sem idLegislatura => só em exercício hoje)
console.log('[1/4] Buscando deputados de SP (dadosabertos.camara.leg.br)…');
const deputadosResp = await buscarJson(
  'https://dadosabertos.camara.leg.br/api/v2/deputados?siglaUf=SP&itens=200',
  'API Câmara'
);
const deputados = (deputadosResp.dados || []).map((d) => ({
  nome: d.nome,
  partido: d.siglaPartido,
  email: d.email,
  pagina: `https://www.camara.leg.br/deputados/${d.id}`,
  casa: 'camara'
}));

// [2/4] senadores em exercício
console.log('[2/4] Buscando senadores de SP (legis.senado.leg.br)…');
const senadoresResp = await buscarJson(
  'https://legis.senado.leg.br/dadosabertos/senador/lista/atual?formato=json',
  'API Senado'
);
const listaSenadores =
  senadoresResp?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar || [];
const senadores = listaSenadores
  .filter((s) => s.IdentificacaoParlamentar?.UfParlamentar === 'SP')
  .map((s) => ({
    nome: s.IdentificacaoParlamentar.NomeParlamentar,
    partido: s.IdentificacaoParlamentar.SiglaPartidoParlamentar,
    email: s.IdentificacaoParlamentar.EmailParlamentar || '',
    pagina: `https://www25.senado.leg.br/web/senadores/senador/-/senador/${s.IdentificacaoParlamentar.CodigoParlamentar}`,
    casa: 'senado'
  }));

// [3/4] validações de integridade (falha nunca é engolida)
if (deputados.length !== 70) {
  falhaPreRequisito(`Câmara devolveu ${deputados.length} deputados de SP (esperado 70).`);
}
if (senadores.length !== 3) {
  falhaPreRequisito(`Senado devolveu ${senadores.length} senadores de SP (esperado 3).`);
}
const semEmail = [...deputados, ...senadores].filter((p) => !p.email);
if (semEmail.length) {
  falhaPreRequisito(`Parlamentares sem e-mail: ${semEmail.map((p) => p.nome).join(', ')}`);
}

const novo = {
  geradoEm: new Date().toISOString().slice(0, 10),
  fonte: 'dadosabertos.camara.leg.br + legis.senado.leg.br',
  deputados,
  senadores
};

// [4/4] escrever ou comparar
if (!CHECK) {
  writeFileSync(ALVO, 'window.PARLAMENTARES = ' + JSON.stringify(novo, null, 2) + ';\n');
  console.log(`[4/4] data.js escrito: ${deputados.length} deputados + ${senadores.length} senadores.`);
  process.exit(0);
}

console.log('[4/4] Modo --check: comparando com data.js atual…');
if (!existsSync(ALVO)) {
  console.error('[CHECK] data.js não existe — dados divergem.');
  process.exit(1);
}
const atual = JSON.parse(
  readFileSync(ALVO, 'utf8').replace(/^window\.PARLAMENTARES = /, '').replace(/;\s*$/, '')
);
const emailsDe = (arr) => arr.map((p) => p.email).sort();
const iguais =
  emailsDe(atual.deputados).join() === emailsDe(novo.deputados).join() &&
  emailsDe(atual.senadores).join() === emailsDe(novo.senadores).join() &&
  atual.deputados.length === novo.deputados.length &&
  atual.senadores.length === novo.senadores.length;
if (iguais) {
  console.log('[CHECK] data.js coerente com as APIs.');
  process.exit(0);
}
console.error('[CHECK] data.js DIVERGIU das APIs — rode "node scripts/gerar-dados.mjs" para atualizar.');
process.exit(1);
