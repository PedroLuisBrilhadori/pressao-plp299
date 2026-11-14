/* mailto.js — montagem de URLs mailto e chunking de destinatários.
 * Funções puras, sem DOM — usadas pelo app.js no browser e testadas
 * via node --test em test/mailto.test.mjs. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.MAILTO = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Máximo de destinatários por mailto: clients (Gmail web, Outlook,
  // Thunderbird) falham ou truncam listas grandes. 12 é seguro para
  // endereços @camara.leg.br/@senado.leg.br (~40 chars cada).
  var CHUNK_SIZE = 12;

  var MAX_URL_LENGTH = 8000; // clients modernos (Gmail web, Outlook, Thunderbird) aceitam mailto longo com segurança; guard contra corpo absurdamente grande

  var EMAIL_RE = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

  function normalizarEmail(email) {
    var e = String(email || '').trim();
    if (!EMAIL_RE.test(e)) {
      throw new Error('E-mail inválido: ' + JSON.stringify(email));
    }
    return e.toLowerCase();
  }

  /** Filtra a bancada de uma UF (exclui registros sem e-mail público).
   * UF vazia/ausente devolve lista vazia. */
  function porUf(parlamentares, uf) {
    if (!uf) return [];
    return (parlamentares || []).filter(function (p) {
      return p.uf === uf && p.email;
    });
  }

  /** Divide a lista de parlamentares em lotes para envio sequencial. */
  function chunkRecipients(parlamentares, size) {
    var n = size || CHUNK_SIZE;
    var chunks = [];
    for (var i = 0; i < parlamentares.length; i += n) {
      chunks.push(parlamentares.slice(i, i + n));
    }
    return chunks;
  }

  /** Substitui placeholders {chave} pelos valores de vars. Chaves
   * ausentes viram string vazia (não sobra {nome} no texto). */
  function renderTemplate(tpl, vars) {
    return String(tpl || '').replace(/\{([a-z_]+)\}/g, function (m, chave) {
      var v = vars && vars[chave];
      return v === undefined || v === null ? '' : String(v);
    });
  }

  /**
   * Monta a URL mailto com destinatários, assunto e corpo codificados.
   * subjects/body NÃO devem conter quebras de linha cru no assunto
   * (clients rejeitam); o assunto é sanitizado aqui.
   */
  function buildMailto(options) {
    var emails = (options.emails || []).map(normalizarEmail);
    if (!emails.length) throw new Error('Nenhum destinatário informado');
    var assunto = String(options.subject || '').replace(/[\r\n]+/g, ' ').trim();
    var corpo = String(options.body || '');
    var url =
      'mailto:' + emails.join(',') +
      '?subject=' + encodeURIComponent(assunto) +
      '&body=' + encodeURIComponent(corpo);
    if (url.length > MAX_URL_LENGTH) {
      throw new Error('URL mailto muito longa (' + url.length + ' chars): reduza o corpo ou o lote');
    }
    return url;
  }

  /** Número de lotes para uma lista (para UI "parte 1 de N"). */
  function countChunks(parlamentares, size) {
    return chunkRecipients(parlamentares, size).length;
  }

  return {
    CHUNK_SIZE: CHUNK_SIZE,
    MAX_URL_LENGTH: MAX_URL_LENGTH,
    normalizarEmail: normalizarEmail,
    porUf: porUf,
    chunkRecipients: chunkRecipients,
    renderTemplate: renderTemplate,
    buildMailto: buildMailto,
    countChunks: countChunks
  };
});
