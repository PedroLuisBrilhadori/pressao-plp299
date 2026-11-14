import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const MAILTO = require('../js/mailto.js');
require('../js/template.js'); // define globalThis.TEMPLATE_PADRAO

const parlamentares = Array.from({ length: 70 }, (_, i) => ({
  nome: `Deputado ${i + 1}`,
  partido: 'TESTE',
  email: `dep${String(i + 1).padStart(2, '0')}@camara.leg.br`,
  pagina: '',
  casa: 'camara'
}));

test('chunkRecipients divide em lotes de 12 e preserva a lista', () => {
  const chunks = MAILTO.chunkRecipients(parlamentares);
  assert.equal(chunks.length, 6); // 70 = 12*5 + 10
  assert.equal(chunks[0].length, 12);
  assert.equal(chunks[5].length, 10);
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  assert.equal(total, 70);
});

test('chunkRecipients com lista menor que o chunk devolve um único lote', () => {
  const chunks = MAILTO.chunkRecipients(parlamentares.slice(0, 3));
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].length, 3);
});

test('chunkRecipients com lista vazia devolve vazio', () => {
  assert.deepEqual(MAILTO.chunkRecipients([]), []);
});

test('buildMailto monta URL com destinatários, assunto e corpo codificados', () => {
  const url = MAILTO.buildMailto({
    emails: ['Dep.Teste@camara.leg.br'],
    subject: 'Vote NO no PLP 299',
    body: 'Prezado(a) Deputado,\n\nVoto contra o pacote.'
  });
  assert.ok(url.startsWith('mailto:dep.teste@camara.leg.br?subject='));
  assert.ok(url.includes('Vote%20NO%20no%20PLP%20299'));
  assert.ok(url.includes('%0A')); // quebra de linha codificada
  assert.ok(url.length < MAILTO.MAX_URL_LENGTH);
});

test('buildMailto rejeita assunto com quebra de linha (sanitiza)', () => {
  const url = MAILTO.buildMailto({
    emails: ['dep@camara.leg.br'],
    subject: 'Assunto\ncom quebra',
    body: 'x'
  });
  assert.ok(!/\r|\n/.test(url.split('?subject=')[1].split('&body=')[0]));
});

test('buildMailto rejeita e-mail inválido', () => {
  assert.throws(() => MAILTO.buildMailto({ emails: ['nao-e-email'], subject: 'x', body: 'y' }), /E-mail inválido/);
  assert.throws(() => MAILTO.buildMailto({ emails: [], subject: 'x', body: 'y' }), /Nenhum destinatário/);
});

test('lote completo de 70 cabe no limite de URL com o corpo real da campanha', () => {
  // contrato real: usa o template padrão de js/template.js (setado em globalThis no node)
  const TEMPLATE_PADRAO = globalThis.TEMPLATE_PADRAO;
  assert.ok(TEMPLATE_PADRAO, 'template.js deve definir TEMPLATE_PADRAO (importar js/template.js no teste)');
  const chunks = MAILTO.chunkRecipients(parlamentares, MAILTO.CHUNK_SIZE);
  for (const chunk of chunks) {
    const url = MAILTO.buildMailto({
      emails: chunk.map(p => p.email),
      subject: TEMPLATE_PADRAO.assunto,
      body: MAILTO.renderTemplate(TEMPLATE_PADRAO.corpo, {
        nome: 'parlamentar(s)', partido: '', meu_nome: 'Teste', minha_cidade: 'São Paulo'
      })
    });
    assert.ok(url.length <= MAILTO.MAX_URL_LENGTH, `URL de ${url.length} chars estourou o limite`);
  }
});

test('renderTemplate substitui placeholders e ignora chaves ausentes', () => {
  const tpl = 'Prezado(a) {nome} ({partido}), assinado por {meu_nome} de {minha_cidade}. {inexistente}';
  const out = MAILTO.renderTemplate(tpl, {
    nome: 'Maria',
    partido: 'PSD',
    meu_nome: 'Pedro',
    minha_cidade: 'São Paulo'
  });
  assert.equal(out, 'Prezado(a) Maria (PSD), assinado por Pedro de São Paulo. ');
});

test('renderTemplate sem vars limpa todos os placeholders', () => {
  assert.equal(MAILTO.renderTemplate('a {nome} b {partido}', {}), 'a  b ');
});

test('countChunks reflete a UI', () => {
  assert.equal(MAILTO.countChunks(parlamentares), 6);
  assert.equal(MAILTO.countChunks(parlamentares, 70), 1);
});

test('porUf filtra pela UF e exclui registros sem e-mail', () => {
  const mista = [
    { nome: 'A', uf: 'SP', email: 'a@camara.leg.br' },
    { nome: 'B', uf: 'MG', email: 'b@camara.leg.br' },
    { nome: 'C', uf: 'SP', email: '' }, // sem e-mail público
    { nome: 'D', uf: 'SP', email: 'd@senado.leg.br' }
  ];
  const sp = MAILTO.porUf(mista, 'SP');
  assert.deepEqual(sp.map(p => p.email), ['a@camara.leg.br', 'd@senado.leg.br']);
});

test('porUf com UF vazia ou lista vazia devolve vazio (não quebra)', () => {
  assert.deepEqual(MAILTO.porUf(parlamentares, ''), []);
  assert.deepEqual(MAILTO.porUf(parlamentares, undefined), []);
  assert.deepEqual(MAILTO.porUf([], 'SP'), []);
});
