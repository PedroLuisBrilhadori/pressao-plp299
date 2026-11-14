#!/usr/bin/env node
/* gerar-dados.mjs — regenera js/data.js a partir das APIs públicas
 * da Câmara (dadosabertos.camara.leg.br) e do Senado (legis.senado.leg.br),
 * cobrindo TODAS as 27 UFs (o visitante escolhe seu estado no site).
 *
 * Modo padrão:  node scripts/gerar-dados.mjs           → reescreve js/data.js
 * Modo check:   node scripts/gerar-dados.mjs --check   → compara com data.js atual,
 *                 exit 0 se igual (contagem + e-mails), exit 1 se divergiu, exit 2
 *                 se pré-requisito ausente (sem rede, API de fora do ar).
 *
 * PLANO:
 *   [1/5] Buscar deputados em exercício (API Câmara, paginado)
 *   [2/5] Buscar senadores em exercício (API Senado, lista/atual)
 *   [3/5] Normalizar registros (nome, partido, uf, email, pagina, casa)
 *   [4/5] Validar integridade (27 UFs, bancadas mínimas, e-mail)
 *   [5/5] Escrever ou comparar js/data.js
 */
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const CHECK = process.argv.includes('--check');
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
const ALVO = join(RAIZ, 'js', 'data.js');

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function falhaPreRequisito(msg) {
  console.error(`[ERRO] ${msg}`);
  process.exit(2);
}

async function buscarJson(url, descricao) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(60_000)
  });
  if (!res.ok) falhaPreRequisito(`${descricao}: HTTP ${res.status}`);
  return res.json();
}

console.log('PLANO: [1/5] deputados (paginado) · [2/5] senadores · [3/5] normalizar · [4/5] validar · [5/5] ' + (CHECK ? 'comparar' : 'escrever') + ' data.js');

// [1/5] deputados em exercício, paginado (API aceita itens grandes, mas paginar é seguro)
console.log('[1/5] Buscando deputados em exercício (dadosabertos.camara.leg.br)…');
const deputadosBrutos = [];
for (let pagina = 1; ; pagina++) {
  const resp = await buscarJson(
    `https://dadosabertos.camara.leg.br/api/v2/deputados?itens=100&pagina=${pagina}&ordem=ASC&ordenarPor=nome`,
    'API Câmara'
  );
  const dados = resp.dados || [];
  deputadosBrutos.push(...dados);
  if (dados.length < 100) break;
  if (pagina > 10) falhaPreRequisito('API Câmara: mais de 10 páginas — abortando por segurança');
}
console.log(`       ${deputadosBrutos.length} deputados recebidos.`);

// [2/5] senadores em exercício (todas as UFs numa chamada só)
console.log('[2/5] Buscando senadores em exercício (legis.senado.leg.br)…');
const senadoresResp = await buscarJson(
  'https://legis.senado.leg.br/dadosabertos/senador/lista/atual?formato=json',
  'API Senado'
);
const listaSenadores =
  senadoresResp?.ListaParlamentarEmExercicio?.Parlamentares?.Parlamentar || [];

// [3/5] normalizar
const deputados = deputadosBrutos.map((d) => ({
  nome: d.nome,
  partido: d.siglaPartido,
  uf: d.siglaUf,
  email: d.email,
  pagina: `https://www.camara.leg.br/deputados/${d.id}`,
  casa: 'camara'
}));
const senadores = listaSenadores
  .filter((s) => s.IdentificacaoParlamentar?.UfParlamentar)
  .map((s) => ({
    nome: s.IdentificacaoParlamentar.NomeParlamentar,
    partido: s.IdentificacaoParlamentar.SiglaPartidoParlamentar,
    uf: s.IdentificacaoParlamentar.UfParlamentar,
    email: s.IdentificacaoParlamentar.EmailParlamentar || '',
    pagina: `https://www25.senado.leg.br/web/senadores/senador/-/senador/${s.IdentificacaoParlamentar.CodigoParlamentar}`,
    casa: 'senado'
  }));

// [4/5] validações de integridade (falha nunca é engolida)
if (deputados.length < 510 || deputados.length > 520) {
  falhaPreRequisito(`Câmara devolveu ${deputados.length} deputados em exercício (esperado ~513).`);
}
if (senadores.length !== 81) {
  falhaPreRequisito(`Senado devolveu ${senadores.length} senadores em exercício (esperado 81).`);
}
const ufsSemDeputado = UFS.filter((uf) => !deputados.some((d) => d.uf === uf));
if (ufsSemDeputado.length) {
  falhaPreRequisito(`UFs sem deputados: ${ufsSemDeputado.join(', ')}`);
}
const ufsSemSenador = UFS.filter((uf) => senadores.filter((s) => s.uf === uf).length !== 3);
if (ufsSemSenador.length) {
  falhaPreRequisito(`UFs sem 3 senadores: ${ufsSemSenador.join(', ')}`);
}
const semEmail = [...deputados, ...senadores].filter((p) => !p.email);
if (semEmail.length) {
  console.warn(`[AVISO] ${semEmail.length} parlamentares sem e-mail público (ficam de fora do envio): ${semEmail.map((p) => `${p.nome} (${p.uf})`).join(', ')}`);
}
const bancadasMinimas = UFS.every((uf) => deputados.filter((d) => d.uf === uf).length >= 8);
if (!bancadasMinimas) {
  falhaPreRequisito('Alguma UF tem menos de 8 deputados (mínimo constitucional) — dados suspeitos.');
}

// [5/5] escrever ou comparar
const novo = {
  geradoEm: new Date().toISOString().slice(0, 10),
  fonte: 'dadosabertos.camara.leg.br + legis.senado.leg.br',
  deputados,
  senadores
};

if (!CHECK) {
  writeFileSync(ALVO, 'window.PARLAMENTARES = ' + JSON.stringify(novo, null, 2) + ';\n');
  console.log(`[5/5] data.js escrito: ${deputados.length} deputados + ${senadores.length} senadores em ${UFS.length} UFs.`);
  process.exit(0);
}

console.log('[5/5] Modo --check: comparando com data.js atual…');
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
