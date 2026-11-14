/* app.js — UI da campanha: template editável (localStorage), envio em lote
 * via chunks mailto, cards individuais com filtros, progresso e share. */
(function () {
  'use strict';

  var MAILTO = window.MAILTO;
  var TPL = window.TEMPLATE_PADRAO;
  var PARLAMENTARES = window.PARLAMENTARES;

  var UF_NOMES = {
    AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
    CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
    MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
    PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
    RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
    RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
    SE: 'Sergipe', TO: 'Tocantins'
  };

  var MODOS_ENVIO = ['mailto', 'gmail', 'outlook', 'yahoo'];

  var LS = {
    uf: 'plp299.uf',
    envio: 'plp299.envio',
    template: 'plp299.template',
    perfil: 'plp299.perfil',
    progresso: 'plp299.progresso',
    selecao: 'plp299.selecao'
  };

  var state = {
    uf: '',
    envio: 'mailto', // mailto | gmail | outlook | yahoo
    template: null, // {assunto, corpo} — null = padrão
    perfil: { meu_nome: '', minha_cidade: '' },
    enviados: {}, // chave "email" -> true
    selecao: {}, // chave "email" -> true (lote personalizado)
    chunkSize: MAILTO.CHUNK_SIZE
  };

  // ---------- storage ----------
  function carregarEstado() {
    try {
      var uf = localStorage.getItem(LS.uf);
      if (uf && UF_NOMES[uf]) state.uf = uf;
      var envio = localStorage.getItem(LS.envio);
      if (envio && MODOS_ENVIO.indexOf(envio) !== -1) state.envio = envio;
      var t = localStorage.getItem(LS.template);
      if (t) state.template = JSON.parse(t);
      var p = localStorage.getItem(LS.perfil);
      if (p) state.perfil = JSON.parse(p);
      var pr = localStorage.getItem(LS.progresso);
      if (pr) state.enviados = JSON.parse(pr);
      var se = localStorage.getItem(LS.selecao);
      if (se) state.selecao = JSON.parse(se);
    } catch (e) {
      console.warn('localStorage indisponível/inválido, usando padrões', e);
    }
  }

  function salvarUf() {
    try { localStorage.setItem(LS.uf, state.uf); } catch (e) { /* private mode */ }
  }
  function salvarEnvio() {
    try { localStorage.setItem(LS.envio, state.envio); } catch (e) { /* private mode */ }
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
  function salvarSelecao() {
    try { localStorage.setItem(LS.selecao, JSON.stringify(state.selecao)); } catch (e) { /* noop */ }
  }

  // ---------- helpers ----------
  function $(id) { return document.getElementById(id); }

  function varsPara(parlamentar, lote) {
    return {
      nome: lote ? 'parlamentar(s)' : parlamentar.nome,
      partido: parlamentar.partido || '',
      uf: state.uf || '',
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

  /** Bancada completa com e-mail — alvo do lote da seção 3. */
  function bancadaParaLote() {
    if (!state.uf) return [];
    return MAILTO.porUf(PARLAMENTARES.deputados, state.uf)
      .concat(MAILTO.porUf(PARLAMENTARES.senadores, state.uf));
  }

  /** Seleção personalizada (lote da seção 4): quem o usuário marcou. */
  function selecaoPersonalizada() {
    if (!state.uf) return [];
    return bancadaUf().filter(function (p) {
      return p.email && state.selecao[p.email];
    });
  }

  /** Atualiza pill da seção 4 e a barra fixa de seleção (rodapé). */
  function atualizarControleSelecao() {
    var lista = selecaoPersonalizada();
    var total = lista.length;
    var pill = $('selecao-status');
    pill.textContent = total === 0
      ? 'Nenhum selecionado — clique nos cards abaixo'
      : total + ' selecionado' + (total === 1 ? '' : 's');
    pill.classList.toggle('pill-vazia', total === 0);

    var barra = $('barra-selecao');
    var box = $('lote-personalizado');
    if (!total) {
      barra.hidden = true;
      box.hidden = true;
      return;
    }
    $('barra-contagem').textContent = total + ' selecionado' + (total === 1 ? '' : 's');
    barra.hidden = false;
    var btnEnviar = $('barra-enviar');
    try {
      btnEnviar.href = MAILTO.buildMensagem(state.envio, {
        emails: lista.map(function (p) { return p.email; }),
        subject: assuntoPara(lista[0], true),
        body: corpoPara(lista[0], true)
      });
      btnEnviar.hidden = false;
      box.hidden = true;
    } catch (e) {
      // URL estourou o limite (raro) — fallback: caixa com partes abaixo dos cards
      btnEnviar.hidden = true;
      box.hidden = false;
      renderLotePersonalizado();
    }
  }

  /** Cliques da barra fixa (limpar/copiar/enviar marcam como enviado). */
  function initBarraSelecao() {
    $('barra-limpar').addEventListener('click', function () {
      state.selecao = {};
      salvarSelecao();
      atualizarControleSelecao();
      renderCards();
    });
    $('barra-copiar').addEventListener('click', function () {
      copiarTexto(selecaoPersonalizada().map(function (p) { return p.email; }).join(', '), this);
    });
    $('barra-enviar').addEventListener('click', function () {
      selecaoPersonalizada().forEach(function (p) { state.enviados[p.email] = true; });
      salvarProgresso();
      setTimeout(renderCards, 600);
    });
  }

  /** Bancada completa da UF (inclui quem não tem e-mail público —
   * usada nos cards e no resumo; o lote usa todosSelecionados). */
  function bancadaUf() {
    if (!state.uf) return [];
    var lista = PARLAMENTARES.deputados.filter(function (p) { return p.uf === state.uf; });
    return lista.concat(PARLAMENTARES.senadores.filter(function (p) { return p.uf === state.uf; }));
  }

  // ---------- seletor de UF ----------
  function initUf() {
    var sel = $('uf');
    Object.keys(UF_NOMES).forEach(function (sigla) {
      var opt = document.createElement('option');
      opt.value = sigla;
      opt.textContent = sigla + ' — ' + UF_NOMES[sigla];
      sel.appendChild(opt);
    });
    sel.value = state.uf;
    atualizarResumoUf();
    sel.addEventListener('change', function () {
      state.uf = sel.value;
      salvarUf();
      atualizarResumoUf();
      // cidade pertence ao estado — limpa se não existir na nova UF
      if (state.perfil.minha_cidade && window.CIDADES &&
          (window.CIDADES[state.uf] || []).indexOf(state.perfil.minha_cidade) === -1) {
        state.perfil.minha_cidade = '';
        salvarPerfil();
      }
      popularCidades();
      $('filtro-partido').value = '';
      reconstruirPartidos();
      renderChunks();
      renderCards();
    });
  }

  function reconstruirPartidos() {
    var sel = $('filtro-partido');
    var valorAtual = sel.value;
    sel.innerHTML = '<option value="">Todos os partidos</option>';
    var partidos = {};
    bancadaUf().forEach(function (p) { partidos[p.partido] = true; });
    Object.keys(partidos).sort().forEach(function (partido) {
      var opt = document.createElement('option');
      opt.value = partido;
      opt.textContent = partido;
      sel.appendChild(opt);
    });
    if (valorAtual && partidos[valorAtual]) sel.value = valorAtual;
  }

  function atualizarResumoUf() {
    var alvo = $('uf-resumo');
    if (!state.uf) {
      alvo.textContent = 'Escolha seu estado para montar os e-mails da sua bancada.';
      return;
    }
    var bancada = bancadaUf();
    var nd = bancada.filter(function (p) { return p.casa === 'camara'; }).length;
    var ns = bancada.filter(function (p) { return p.casa === 'senado'; }).length;
    var semEmail = bancada.filter(function (p) { return !p.email; }).length;
    var texto = UF_NOMES[state.uf] + ': ' + nd + ' deputados + ' + ns + ' senadores.';
    if (semEmail) {
      texto += ' (' + semEmail + ' sem e-mail público — envio só pela página oficial)';
    }
    alvo.textContent = texto;
  }

  // ---------- editor de template ----------
  var CIDADE_OUTRA = '__outra__';

  /** Popula o select de cidades conforme o estado escolhido. Restaura a
   * cidade salva se existir na lista; se não, abre o campo "Outra…". */
  function popularCidades() {
    var sel = $('cidade-select');
    var wrap = $('cidade-outra-wrap');
    var input = $('minha-cidade');
    sel.innerHTML = '';
    if (!state.uf || !window.CIDADES || !window.CIDADES[state.uf]) {
      sel.disabled = true;
      var opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = '— escolha o estado no passo 1 —';
      sel.appendChild(opt0);
      wrap.hidden = true;
      return;
    }
    sel.disabled = false;
    var opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '— selecione —';
    sel.appendChild(opt);
    window.CIDADES[state.uf].forEach(function (nome) {
      var o = document.createElement('option');
      o.value = nome;
      o.textContent = nome;
      sel.appendChild(o);
    });
    var outra = document.createElement('option');
    outra.value = CIDADE_OUTRA;
    outra.textContent = 'Outra… (digitar)';
    sel.appendChild(outra);

    var salva = state.perfil.minha_cidade || '';
    var naLista = window.CIDADES[state.uf].indexOf(salva) !== -1;
    if (salva && naLista) {
      sel.value = salva;
      wrap.hidden = true;
    } else if (salva) {
      sel.value = CIDADE_OUTRA;
      wrap.hidden = false;
      input.value = salva;
    } else {
      sel.value = '';
      wrap.hidden = true;
      input.value = '';
    }
  }

  function initEditor() {
    var assunto = $('assunto');
    var corpo = $('corpo');
    var nome = $('meu-nome');
    var cidadeSelect = $('cidade-select');
    var cidadeInput = $('minha-cidade');

    assunto.value = (state.template && state.template.assunto) || TPL.assunto;
    corpo.value = (state.template && state.template.corpo) || TPL.corpo;
    nome.value = state.perfil.meu_nome || '';
    popularCidades();

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
      // cidade: a do select manda; o input só vale no modo "Outra…"
      var cidade = !$('cidade-outra-wrap').hidden ? cidadeInput.value : state.perfil.minha_cidade;
      state.perfil = { meu_nome: nome.value, minha_cidade: cidade || '' };
      salvarPerfil();
      renderChunks();
      renderCards();
    }
    nome.addEventListener('input', aoDigitarPerfil);
    cidadeInput.addEventListener('input', aoDigitarPerfil);

    cidadeSelect.addEventListener('change', function () {
      if (cidadeSelect.value === CIDADE_OUTRA) {
        $('cidade-outra-wrap').hidden = false;
        state.perfil.minha_cidade = cidadeInput.value;
        salvarPerfil();
        cidadeInput.focus();
        return;
      }
      $('cidade-outra-wrap').hidden = true;
      cidadeInput.value = '';
      state.perfil.minha_cidade = cidadeSelect.value;
      salvarPerfil();
      renderChunks();
      renderCards();
    });

    $('reset-template').addEventListener('click', function () {
      assunto.value = TPL.assunto;
      corpo.value = TPL.corpo;
      state.template = null;
      salvarTemplate();
      renderChunks();
      renderCards();
    });
  }

  // ---------- envio em lote (seção 3: bancada completa) ----------
  function initBatch() {
    var modo = $('modo-envio');
    modo.value = state.envio;
    modo.addEventListener('change', function () {
      state.envio = modo.value;
      salvarEnvio();
      renderChunks();
      renderCards();
      renderLotePersonalizado();
    });
    $('reset-progresso').addEventListener('click', function () {
      state.enviados = {};
      salvarProgresso();
      renderChunks();
      renderCards();
    });
    $('copy-emails').addEventListener('click', function () {
      var emails = bancadaParaLote().map(function (p) { return p.email; });
      copiarTexto(emails.join(', '), this);
    });
    atualizarControleSelecao();
    renderChunks();
  }

  /** Cria o botão de envio (único ou parte) num container. */
  function criarBotaoUnico(container, lista, url, label, aoClicar) {
    var grupo = document.createElement('span');
    grupo.className = 'chunk-group';
    var btn = document.createElement('a');
    btn.className = 'btn chunk-btn btn-primary';
    btn.href = url;
    btn.textContent = label;
    var sub = document.createElement('small');
    sub.textContent = lista.length + (lista.length === 1 ? ' destinatário' : ' destinatários');
    btn.appendChild(sub);
    btn.addEventListener('click', function () {
      lista.forEach(function (p) { state.enviados[p.email] = true; });
      salvarProgresso();
      setTimeout(aoClicar || function () { renderChunks(); renderCards(); }, 600);
    });
    grupo.appendChild(btn);
    grupo.appendChild(criarBotaoCopiar(lista, btn));
    container.appendChild(grupo);
  }

  function renderChunks() {
    var container = $('chunks');
    container.innerHTML = '';
    var lista = bancadaParaLote();
    if (!lista.length) {
      container.innerHTML = '<p class="hint">Escolha seu estado no passo 1 para montar os lotes de envio.</p>';
      renderProgresso(0);
      return;
    }
    try {
      var url = MAILTO.buildMensagem(state.envio, {
        emails: lista.map(function (p) { return p.email; }),
        subject: assuntoPara(lista[0], true),
        body: corpoPara(lista[0], true)
      });
      criarBotaoUnico(container, lista, url, 'Enviar para todos de uma vez');
    } catch (e) {
      // URL estourou o limite (raro) — fallback em partes balanceadas
      container.innerHTML = '<p class="hint">Sua mensagem + bancada são grandes demais para um e-mail único — envie pelas partes abaixo:</p>';
      var partes = MAILTO.chunkRecipients(lista, state.chunkSize);
      partes.forEach(function (chunk, i) {
        var urlParte = MAILTO.buildMensagem(state.envio, {
          emails: chunk.map(function (p) { return p.email; }),
          subject: assuntoPara(chunk[0], true),
          body: corpoPara(chunk[0], true)
        });
        criarBotaoUnico(container, chunk, urlParte, 'Enviar parte ' + (i + 1) + ' de ' + partes.length);
      });
    }
    renderProgresso(lista.length);
  }

  /** Fallback por parte: copia os e-mails do chunk (p/ quando o navegador
   * bloquear o mailto ou o usuário preferir colar no app de e-mail). */
  function criarBotaoCopiar(chunk, btnReferencia) {
    var copiar = document.createElement('button');
    copiar.className = 'btn btn-ghost btn-small chunk-copy';
    copiar.textContent = 'copiar';
    copiar.title = 'Copiar os e-mails desta parte';
    copiar.addEventListener('click', function () {
      copiarTexto(chunk.map(function (p) { return p.email; }).join(', '), copiar);
      void btnReferencia;
    });
    return copiar;
  }

  /** Lote personalizado (seção 4): botão único com a seleção do usuário,
   * fallback em partes só se a URL estourar o limite. */
  function renderLotePersonalizado() {
    var container = $('chunks-selecao');
    if (!container) return;
    container.innerHTML = '';
    var lista = selecaoPersonalizada();
    if (!lista.length) return;
    try {
      var url = MAILTO.buildMensagem(state.envio, {
        emails: lista.map(function (p) { return p.email; }),
        subject: assuntoPara(lista[0], true),
        body: corpoPara(lista[0], true)
      });
      criarBotaoUnico(container, lista, url, 'Enviar para os selecionados', renderCards);
    } catch (e) {
      var partes = MAILTO.chunkRecipients(lista, state.chunkSize);
      partes.forEach(function (chunk, i) {
        var urlParte = MAILTO.buildMensagem(state.envio, {
          emails: chunk.map(function (p) { return p.email; }),
          subject: assuntoPara(chunk[0], true),
          body: corpoPara(chunk[0], true)
        });
        criarBotaoUnico(container, chunk, urlParte, 'Enviar parte ' + (i + 1) + ' de ' + partes.length, renderCards);
      });
    }
  }

  function renderProgresso(total) {
    var lista = bancadaParaLote();
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
    reconstruirPartidos();
    $('busca').addEventListener('input', renderCards);
    $('filtro-partido').addEventListener('change', renderCards);
    $('filtro-casa').addEventListener('change', renderCards);
    $('sel-filtrados').addEventListener('click', function () {
      listaFiltrada().forEach(function (p) {
        if (p.email) state.selecao[p.email] = true;
      });
      salvarSelecao();
      atualizarControleSelecao();
      renderCards();
    });
    $('sel-limpar').addEventListener('click', function () {
      state.selecao = {};
      salvarSelecao();
      atualizarControleSelecao();
      renderCards();
    });
    renderCards();
  }

  /** Card inteiro é clicável para seleção (links/botões dentro do card
   * não disparam seleção). */
  function toggleSelecaoCard(card, p) {
    if (state.selecao[p.email]) {
      delete state.selecao[p.email];
      card.classList.remove('selecionado');
    } else {
      state.selecao[p.email] = true;
      card.classList.add('selecionado');
    }
    salvarSelecao();
    atualizarControleSelecao();
  }

  function listaFiltrada() {
    var busca = $('busca').value.trim().toLowerCase();
    var partido = $('filtro-partido').value;
    var casa = $('filtro-casa').value;
    var lista = bancadaUf();
    return lista.filter(function (p) {
      if (partido && p.partido !== partido) return false;
      if (casa && p.casa !== casa) return false;
      if (busca && p.nome.toLowerCase().indexOf(busca) === -1) return false;
      return true;
    });
  }

  function renderCards() {
    var container = $('parlamentares');
    if (!state.uf) {
      $('lista-contagem').textContent = 'Escolha seu estado no passo 1 para ver sua bancada.';
      container.innerHTML = '';
      return;
    }
    var filtrada = listaFiltrada();
    $('lista-contagem').textContent = filtrada.length + ' parlamentares listados.';
    container.innerHTML = '';

    filtrada.forEach(function (p) {
      var casa = p.casa === 'senado' ? 'Senado' : 'Câmara dos Deputados';
      var enviado = !!state.enviados[p.email];
      var noLote = !!(p.email && state.selecao[p.email]);

      var card = document.createElement('div');
      card.className = 'card' + (noLote ? ' selecionado' : '');
      if (p.email) {
        card.addEventListener('click', function (ev) {
          if (ev.target.closest('a, button')) return;
          toggleSelecaoCard(card, p);
        });
      }

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

      var btnMail;
      if (p.email) {
        btnMail = document.createElement('a');
        try {
          btnMail.href = MAILTO.buildMensagem(state.envio, {
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
      } else {
        btnMail = document.createElement('span');
        btnMail.className = 'btn btn-small btn-ghost';
        btnMail.style.pointerEvents = 'none';
        btnMail.style.opacity = '0.55';
        btnMail.textContent = 'Sem e-mail público';
      }

      var btnPagina = document.createElement('a');
      btnPagina.className = 'btn btn-ghost btn-small';
      btnPagina.href = p.pagina || '#';
      btnPagina.target = '_blank';
      btnPagina.rel = 'noopener';
      btnPagina.textContent = 'Página ↗';

      actions.appendChild(btnMail);
      actions.appendChild(btnPagina);

      // badge de seleção no canto do card (lote personalizado) — só quem tem e-mail
      if (p.email) {
        var badge = document.createElement('span');
        badge.className = 'card-check';
        badge.textContent = '✓';
        card.appendChild(badge);
      }

      card.appendChild(head);
      card.appendChild(casaEl);
      card.appendChild(email);
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  // ---------- share ----------
  function initShare() {
    var msg = 'Vote NÃO no PLP 299/2026 — envie um e-mail do seu próprio endereço para a bancada do seu estado: ';
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

  // ---------- embeds de vídeo (facade: thumbnail real + play; iframe só ao clicar) ----------
  function initVideos() {
    document.querySelectorAll('.video-embed').forEach(function (el) {
      var id = el.getAttribute('data-video-id');
      if (!id) return;

      var facade = document.createElement('button');
      facade.type = 'button';
      facade.className = 'video-facade';
      facade.setAttribute('aria-label', 'Assistir ao vídeo');

      var img = document.createElement('img');
      img.src = 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg';
      img.alt = 'Clique para assistir: prévia do vídeo';
      img.loading = 'lazy';
      facade.appendChild(img);

      var play = document.createElement('span');
      play.className = 'video-play';
      play.textContent = '▶';
      facade.appendChild(play);

      facade.addEventListener('click', function () {
        var iframe = document.createElement('iframe');
        iframe.src = 'https://www.youtube.com/embed/' + id + '?autoplay=1&rel=0';
        iframe.title = 'Vídeo da campanha';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        el.innerHTML = '';
        el.appendChild(iframe);
      });

      el.appendChild(facade);
    });
  }

  // ---------- boot ----------
  carregarEstado();
  initUf();
  initBarraSelecao();
  initEditor();
  initBatch();
  initCards();
  initShare();
  initVideos();
})();
