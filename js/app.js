/* app.js — UI da campanha: template editável (localStorage), envio em lote
 * via chunks mailto, cards individuais com filtros, progresso e share. */
(function () {
  'use strict';

  var MAILTO = window.MAILTO;
  var TPL = window.TEMPLATE_PADRAO;
  var PARLAMENTARES = window.PARLAMENTARES;

  var LS = {
    template: 'plp299.template',
    perfil: 'plp299.perfil',
    progresso: 'plp299.progresso'
  };

  var state = {
    template: null, // {assunto, corpo} — null = padrão
    perfil: { meu_nome: '', minha_cidade: '' },
    enviados: {}, // chave "email" -> true
    chunkSize: MAILTO.CHUNK_SIZE
  };

  // ---------- storage ----------
  function carregarEstado() {
    try {
      var t = localStorage.getItem(LS.template);
      if (t) state.template = JSON.parse(t);
      var p = localStorage.getItem(LS.perfil);
      if (p) state.perfil = JSON.parse(p);
      var pr = localStorage.getItem(LS.progresso);
      if (pr) state.enviados = JSON.parse(pr);
    } catch (e) {
      console.warn('localStorage indisponível/inválido, usando padrões', e);
    }
  }

  function salvarTemplate() {
    try { localStorage.setItem(LS.template, JSON.stringify(state.template)); } catch (e) { /* private mode */ }
  }
  function salvarPerfil() {
    try { localStorage.setItem(LS.perfil, JSON.stringify(state.perfil)); } catch (e) { /* noop */ }
  }
  function salvarProgresso() {
    try { localStorage.setItem(LS.progresso, JSON.stringify(state.enviados)); } catch (e) { /* noop */ }
  }

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }

  function varsPara(parlamentar, lote) {
    return {
      nome: lote ? 'parlamentar(s)' : parlamentar.nome,
      partido: parlamentar.partido || '',
      meu_nome: state.perfil.meu_nome || '',
      minha_cidade: state.perfil.minha_cidade || ''
    };
  }

  function assuntoPara(parlamentar, lote) {
    var tpl = (state.template && state.template.assunto) || TPL.assunto;
    return MAILTO.renderTemplate(tpl, varsPara(parlamentar, lote));
  }

  function corpoPara(parlamentar, lote) {
    var tpl = (state.template && state.template.corpo) || TPL.corpo;
    return MAILTO.renderTemplate(tpl, varsPara(parlamentar, lote));
  }

  function todosSelecionados() {
    var lista = PARLAMENTARES.deputados.slice();
    if ($('incluir-senadores').checked) lista = lista.concat(PARLAMENTARES.senadores);
    return lista;
  }

  // ---------- editor de template ----------
  function initEditor() {
    var assunto = $('assunto');
    var corpo = $('corpo');
    var nome = $('meu-nome');
    var cidade = $('minha-cidade');

    assunto.value = (state.template && state.template.assunto) || TPL.assunto;
    corpo.value = (state.template && state.template.corpo) || TPL.corpo;
    nome.value = state.perfil.meu_nome || '';
    cidade.value = state.perfil.minha_cidade || '';

    function aoDigitar() {
      var padrãoOuCustom = { assunto: assunto.value, corpo: corpo.value };
      // se voltou idêntico ao padrão, não guarda (fica sincronizado com updates da campanha)
      state.template = (padrãoOuCustom.assunto === TPL.assunto && padrãoOuCustom.corpo === TPL.corpo)
        ? null : padrãoOuCustom;
      salvarTemplate();
      renderChunks();
      renderCards();
    }
    assunto.addEventListener('input', aoDigitar);
    corpo.addEventListener('input', aoDigitar);

    function aoDigitarPerfil() {
      state.perfil = { meu_nome: nome.value, minha_cidade: cidade.value };
      salvarPerfil();
      renderChunks();
      renderCards();
    }
    nome.addEventListener('input', aoDigitarPerfil);
    cidade.addEventListener('input', aoDigitarPerfil);

    $('reset-template').addEventListener('click', function () {
      assunto.value = TPL.assunto;
      corpo.value = TPL.corpo;
      state.template = null;
      salvarTemplate();
      renderChunks();
      renderCards();
    });
  }

  // ---------- envio em lote ----------
  function initBatch() {
    $('incluir-senadores').addEventListener('change', function () {
      renderChunks();
      renderCards();
    });
    $('reset-progresso').addEventListener('click', function () {
      state.enviados = {};
      salvarProgresso();
      renderChunks();
      renderCards();
    });
    $('copy-emails').addEventListener('click', function () {
      var emails = todosSelecionados().map(function (p) { return p.email; });
      copiarTexto(emails.join(', '), this);
    });
    renderChunks();
  }

  function renderChunks() {
    var container = $('chunks');
    container.innerHTML = '';
    var lista = todosSelecionados();
    var chunks = MAILTO.chunkRecipients(lista, state.chunkSize);
    var total = lista.length;

    chunks.forEach(function (chunk, i) {
      var enviadosNoChunk = chunk.filter(function (p) { return state.enviados[p.email]; }).length;
      var completo = enviadosNoChunk === chunk.length;
      var url;
      try {
        url = MAILTO.buildMailto({
          emails: chunk.map(function (p) { return p.email; }),
          subject: assuntoPara(chunk[0], true),
          body: corpoPara(chunk[0], true)
        });
      } catch (e) {
        // URL muito longa — divide o chunk ao meio (guard de segurança)
        if (chunk.length > 1) {
          var meio = Math.ceil(chunk.length / 2);
          var metades = MAILTO.chunkRecipients(chunk, meio);
          metades.forEach(function (m, j) {
            var btn = criarBotaoChunk(m, i + '/' + j, container);
            void btn;
          });
          return;
        }
        throw e;
      }
      var btn = document.createElement('a');
      btn.className = 'btn chunk-btn ' + (completo ? 'btn sent' : 'btn-primary');
      btn.href = url;
      btn.textContent = 'Enviar parte ' + (i + 1) + ' de ' + chunks.length;
      var sub = document.createElement('small');
      sub.textContent = (completo ? '✓ enviado · ' : '') + chunk.length + (chunk.length === 1 ? ' destinatário' : ' destinatários');
      btn.appendChild(sub);
      btn.addEventListener('click', function () {
        chunk.forEach(function (p) {
          state.enviados[p.email] = true;
        });
        salvarProgresso();
        // deixa o client de e-mail abrir antes de re-renderizar
        setTimeout(function () { renderChunks(); renderCards(); }, 600);
      });
      container.appendChild(btn);
    });

    renderProgresso(total);
  }

  function criarBotaoChunk(chunk, label, container) {
    var url = MAILTO.buildMailto({
      emails: chunk.map(function (p) { return p.email; }),
      subject: assuntoPara(chunk[0], true),
      body: corpoPara(chunk[0], true)
    });
    var btn = document.createElement('a');
    btn.className = 'btn btn-primary chunk-btn';
    btn.href = url;
    btn.textContent = 'Enviar parte ' + label;
    container.appendChild(btn);
    return btn;
  }

  function renderProgresso(total) {
    var lista = todosSelecionados();
    var enviados = lista.filter(function (p) { return state.enviados[p.email]; }).length;
    var pct = total ? Math.round((enviados / total) * 100) : 0;
    $('progress-fill').style.width = pct + '%';
    $('progresso-texto').textContent =
      enviados === 0 ? 'Nenhum e-mail enviado ainda.' :
        enviados + ' de ' + total + ' parlamentares contatados (' + pct + '%)' +
        (enviados === total ? ' — campanha completa, obrigado! 🎉' : '');
  }

  // ---------- cards individuais ----------
  function initCards() {
    var partidos = {};
    todosSelecionados().forEach(function (p) { partidos[p.partido] = true; });
    var sel = $('filtro-partido');
    Object.keys(partidos).sort().forEach(function (partido) {
      var opt = document.createElement('option');
      opt.value = partido;
      opt.textContent = partido;
      sel.appendChild(opt);
    });
    $('busca').addEventListener('input', renderCards);
    $('filtro-partido').addEventListener('change', renderCards);
    $('filtro-casa').addEventListener('change', renderCards);
    renderCards();
  }

  function listaFiltrada() {
    var busca = $('busca').value.trim().toLowerCase();
    var partido = $('filtro-partido').value;
    var casa = $('filtro-casa').value;
    var lista = todosSelecionados();
    return lista.filter(function (p) {
      if (partido && p.partido !== partido) return false;
      if (casa && p.casa !== casa) return false;
      if (busca && p.nome.toLowerCase().indexOf(busca) === -1) return false;
      return true;
    });
  }

  function renderCards() {
    var container = $('parlamentares');
    var filtrada = listaFiltrada();
    $('lista-contagem').textContent = filtrada.length + ' parlamentares listados.';
    container.innerHTML = '';

    filtrada.forEach(function (p) {
      var casa = p.casa === 'senado' ? 'Senado' : 'Câmara dos Deputados';
      var enviado = !!state.enviados[p.email];

      var card = document.createElement('div');
      card.className = 'card';

      var head = document.createElement('div');
      head.className = 'card-head';
      var nome = document.createElement('span');
      nome.className = 'card-nome';
      nome.textContent = p.nome;
      var partido = document.createElement('span');
      partido.className = 'card-partido';
      partido.textContent = p.partido;
      head.appendChild(nome);
      head.appendChild(partido);

      var casaEl = document.createElement('span');
      casaEl.className = 'card-casa';
      casaEl.textContent = casa;

      var email = document.createElement('span');
      email.className = 'card-email';
      email.textContent = p.email;

      var actions = document.createElement('div');
      actions.className = 'card-actions';

      var btnMail = document.createElement('a');
      try {
        btnMail.href = MAILTO.buildMailto({
          emails: [p.email],
          subject: assuntoPara(p, false),
          body: corpoPara(p, false)
        });
      } catch (e) { btnMail.href = 'mailto:' + p.email; }
      btnMail.className = 'btn btn-small ' + (enviado ? 'btn sent' : 'btn-primary');
      btnMail.textContent = enviado ? '✓ Reenviar' : 'Enviar e-mail';
      btnMail.addEventListener('click', function () {
        state.enviados[p.email] = true;
        salvarProgresso();
        setTimeout(function () {
          btnMail.className = 'btn btn-small btn sent';
          btnMail.textContent = '✓ Reenviar';
          renderProgresso(todosSelecionados().length);
        }, 600);
      });

      var btnPagina = document.createElement('a');
      btnPagina.className = 'btn btn-ghost btn-small';
      btnPagina.href = p.pagina || '#';
      btnPagina.target = '_blank';
      btnPagina.rel = 'noopener';
      btnPagina.textContent = 'Página ↗';

      actions.appendChild(btnMail);
      actions.appendChild(btnPagina);

      card.appendChild(head);
      card.appendChild(casaEl);
      card.appendChild(email);
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  // ---------- share ----------
  function initShare() {
    var msg = 'Vote NO no PLP 299/2026 — envie um e-mail do seu próprio endereço para todos os deputados e senadores de SP: ';
    $('whatsapp-share').href = 'https://wa.me/?text=' + encodeURIComponent(msg + window.location.href);
    $('copy-site').addEventListener('click', function () {
      copiarTexto(window.location.href, this);
    });
  }

  function copiarTexto(texto, btn) {
    function feedback() {
      if (!btn) return;
      var original = btn.textContent;
      btn.textContent = '✓ Copiado!';
      setTimeout(function () { btn.textContent = original; }, 1500);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(feedback);
    } else {
      var ta = document.createElement('textarea');
      ta.value = texto;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      feedback();
    }
  }

  // ---------- embeds de vídeo (facade: só carrega iframe ao clicar) ----------
  function initVideos() {
    document.querySelectorAll('.video-embed').forEach(function (el) {
      var id = el.getAttribute('data-video-id');
      var link = el.querySelector('.video-fallback');
      if (!id || !link) return;
      link.addEventListener('click', function (ev) {
        ev.preventDefault();
        var iframe = document.createElement('iframe');
        iframe.src = 'https://www.youtube-nocookie.com/embed/' + id +
          '?autoplay=1&rel=0';
        iframe.title = 'Vídeo da campanha';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        el.innerHTML = '';
        el.appendChild(iframe);
      });
    });
  }

  // ---------- boot ----------
  carregarEstado();
  initEditor();
  initBatch();
  initCards();
  initShare();
  initVideos();
})();
