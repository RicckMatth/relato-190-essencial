/* sade-adapter.js — Adaptador SADE para Relato 190 Essencial v5.7.0
 * Detecta e mapeia automaticamente os campos do formulário de atendimento do SADE.
 * NÃO cria painéis, barras ou interface própria — comunica-se com o content.js via CustomEvent.
 * NÃO coleta credenciais, tokens, cookies ou textos de ocorrências.
 * NÃO realiza submissão automática.
 * Opera exclusivamente sobre atributos de campos necessários ao funcionamento da extensão.
 */
(function () {
  'use strict';

  // ── Constantes de identificação ──────────────────────────────────────────
  const ADAPTER_VERSION = '5.7.0';
  const EVENT_OUT = 'relato190:sade:status';   // adaptador → content.js
  const EVENT_IN  = 'relato190:sade:command';  // content.js → adaptador

  // URL pattern do sistema SADE (container)
  const SADE_PATH_PATTERN = /\/syspm-web\/public\//i;

  // Rota conhecida do formulário dentro do iframe
  const SADE_FORM_PATHS = [
    /\/syspm-web\/public\/atendimento\/saveLegado/i,
    /\/syspm-web\/public\/atendimento\b/i,
  ];

  // Seletores do iframe principal identificados no HTML sanitizado
  const IFRAME_SELECTORS = [
    '#iframeContainer',
    'iframe[name="container"]',
    'iframe[id="iframeContainer"]',
  ];

  // ── Thresholds de confiança ───────────────────────────────────────────────
  const SCORE_AUTO    = 70;  // Vínculo automático silencioso
  const SCORE_CONFIRM = 45;  // Vínculo sugerido — requer confirmação do operador
  // Abaixo de 45: campo ignorado nesta varredura

  // ── Sinais heurísticos por campo ─────────────────────────────────────────
  // Cada entrada é [padrão regex, pontuação base].
  // Múltiplos sinais de um mesmo elemento se somam (limitado a 100).
  const FIELD_SIGNALS = {
    nome: [
      [/\bnome\s+do\s+solicitante\b/i, 95],
      [/\bsolicitante\b/i, 85],
      [/\brequerente\b/i, 80],
      [/\bnome\b/i, 65],
    ],
    telefone: [
      [/\btelefone\b/i, 90],
      [/\bfone\b/i, 85],
      [/\bcelular\b/i, 80],
      [/\bcontato\b/i, 65],
      [/\btel\.?\b/i, 75],
    ],
    cidade: [
      [/\bmunic[íi]pio\b/i, 95],
      [/\bcidade\b/i, 90],
      [/\blocal(?:idade)?\b/i, 55],
    ],
    rua: [
      [/\blogradouro\b/i, 95],
      [/\brendere[cç]o\b/i, 80],
      [/\brua\b/i, 85],
      [/\bvia\b/i, 50],
    ],
    numero: [
      [/\bn[úu]mero\b/i, 95],
      [/\bnr?[º°\.]?\b/i, 85],
      [/\bn[°º]\b/i, 90],
      [/\bhouse\s*no?\b/i, 60],
    ],
    bairro: [
      [/\bbairro\b/i, 95],
      [/\bsetor\b/i, 75],
      [/\bdistrito\b/i, 65],
    ],
    complemento: [
      [/\bcomplemento\b/i, 95],
      [/\bcompl\.?\b/i, 85],
      [/\bapto?\.?\b/i, 70],
      [/\bapartamento\b/i, 75],
    ],
    relato: [
      [/\brelato\b/i, 95],
      [/\bocorr[êe]ncia\b/i, 90],
      [/\bdescri[cç][aã]o\b/i, 80],
      [/\bnar(?:rati)?va\b/i, 75],
      [/\btexto\b/i, 55],
    ],
    cep: [
      [/\bcep\b/i, 95],
      [/\bc[oó]d(?:igo)?\s*postal\b/i, 90],
    ],
  };

  // Campos que NÃO devem ser confundidos com "relato" (requisito 4: singular e plural)
  const RELATO_EXCLUSIONS = [
    /\bobserva[cç][oõaã]es?\b/i,
    /\bobserva[cç][aã]o\b/i,
    /\bhist[oó]ricos?\b/i,
    /\bcoment[aá]rios?\b/i,
    /\bcomments?\b/i,
    /\bpesquis[ae]s?\b/i,
    /\bbuscas?\b/i,
    /\bfiltros?\b/i,
    /\bsearch(?:es)?\b/i,
    /\bnotas?\b/i,
  ];

  // ── Estado interno ────────────────────────────────────────────────────────
  let state = {
    status: 'idle',       // idle | detecting | waiting | partial | mapped | unavailable | dismissed
    iframeEl: null,
    formDoc: null,
    candidates: {},       // { key: { el, score, source } }
    confirmed: {},        // keys confirmados pelo operador
    dismissed: false,
    observer: null,
    formObserver: null,
    retryCount: 0,
  };

  // ── Verificação de URL e presença do SADE ────────────────────────────────
  function isSadePage() {
    if (SADE_PATH_PATTERN.test(window.location.pathname) || SADE_PATH_PATTERN.test(window.location.href)) return true;
    if (/teste[-_]sade|simulador/i.test(window.location.pathname) || /teste[-_]sade|simulador/i.test(window.location.href)) return true;
    if (document.querySelector('#iframeContainer') || document.querySelector('iframe[name="container"]')) return true;
    return false;
  }

  // ── Utilitários de texto ──────────────────────────────────────────────────
  function cleanText(v) {
    return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
  }

  /**
   * Coleta todos os sinais de texto associados a um elemento:
   * label[for], aria-label, aria-labelledby, placeholder, name,
   * e texto do elemento pai próximo.
   */
  function collectSignals(el, doc) {
    const signals = [];

    // 1. Labels associadas formalmente
    const labels = [...(el.labels || [])];
    if (el.id) {
      const byFor = [...doc.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`)];
      for (const l of byFor) if (!labels.includes(l)) labels.push(l);
    }
    for (const label of labels) {
      const copy = label.cloneNode(true);
      copy.querySelectorAll('input,textarea,select,button').forEach(x => x.remove());
      signals.push(['label', cleanText(copy.textContent)]);
    }

    // 2. aria-label
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel) signals.push(['aria-label', cleanText(ariaLabel)]);

    // 3. aria-labelledby
    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        const ref = doc.getElementById(id);
        if (ref) signals.push(['aria-labelledby', cleanText(ref.textContent)]);
      }
    }

    // 4. placeholder
    const placeholder = el.getAttribute('placeholder');
    if (placeholder) signals.push(['placeholder', cleanText(placeholder)]);

    // 5. name attribute
    const name = el.getAttribute('name');
    if (name) signals.push(['name', cleanText(name)]);

    // 6. title
    const title = el.getAttribute('title');
    if (title) signals.push(['title', cleanText(title)]);

    // 7. Texto do elemento pai imediato (excluindo o próprio input)
    const parent = el.parentElement;
    if (parent) {
      const copy = parent.cloneNode(true);
      copy.querySelectorAll('input,textarea,select,button,script,style').forEach(x => x.remove());
      const txt = cleanText(copy.textContent);
      if (txt) signals.push(['parent-text', txt]);
    }

    // 8. Célula anterior em formulários tabulares legados (ex.: <td>Nome:</td><td><input></td>)
    const tdCell = el.closest('td,th');
    if (tdCell) {
      const prevCell = tdCell.previousElementSibling;
      if (prevCell && (prevCell.tagName === 'TD' || prevCell.tagName === 'TH') && !prevCell.querySelector('input,textarea,select')) {
        const txt = cleanText(prevCell.textContent);
        if (txt) signals.push(['table-cell', txt]);
      }
    }

    return signals;
  }

  /**
   * Pontua um elemento para um campo específico.
   * Retorna { score: 0-100, source: string }
   */
  function scoreElement(el, fieldKey, doc) {
    const patterns = FIELD_SIGNALS[fieldKey];
    if (!patterns) return { score: 0, source: '' };

    const signals = collectSignals(el, doc);
    let best = 0, bestSource = '';

    for (const [signalType, signalText] of signals) {
      for (const [pattern, baseScore] of patterns) {
        if (pattern.test(signalText)) {
          // Sinais de label formal têm bônus de confiança
          const bonus = ['label', 'aria-label', 'aria-labelledby'].includes(signalType) ? 5 : 0;
          const s = Math.min(100, baseScore + bonus);
          if (s > best) { best = s; bestSource = signalType + ':' + signalText.slice(0, 40); }
        }
      }
    }
    return { score: best, source: bestSource };
  }

  /**
   * Verifica se um elemento é candidato válido para um campo.
   */
  function isValidControl(el, fieldKey) {
    if (!el || el.nodeType !== 1) return false;
    if (el.disabled) return false;

    const tag = el.tagName;
    if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(tag) && !el.isContentEditable) return false;

    // Campo "relato": precisa ser TEXTAREA ou contentEditable ou input text grande
    if (fieldKey === 'relato') {
      if (tag !== 'TEXTAREA' && !el.isContentEditable) return false;
      // Excluir caixas de busca/observação pelo label
      // (verificado depois de coletar sinais — ver scanForm)
      return true;
    }

    // Outros campos: aceitar input text/tel/number/search, select, textarea
    if (tag === 'INPUT') {
      return ['text', 'tel', 'number', 'search', 'email', 'url', ''].includes(el.type || '');
    }
    return true;
  }

  /**
   * Verifica se o elemento "relato" tem sinais de exclusão (busca, observação etc.)
   */
  function hasExclusionSignal(el, doc) {
    const signals = collectSignals(el, doc);
    for (const [, txt] of signals) {
      for (const excl of RELATO_EXCLUSIONS) {
        if (excl.test(txt)) return true;
      }
    }
    return false;
  }

  // ── Varredura do formulário ───────────────────────────────────────────────
  /**
   * Varre todos os controles do documento e retorna os melhores candidatos
   * por campo, com score e fonte do sinal.
   */
  function scanForm(doc) {
    if (!doc) return {};

    const controls = [...doc.querySelectorAll('input,textarea,select,[contenteditable]')]
      .filter(el => {
        if (el.hidden || el.type === 'hidden') return false;
        const rect = el.getBoundingClientRect();
        // Aceitar elementos não visíveis (rect zero) em formulários legados
        return true;
      });

    const fieldKeys = Object.keys(FIELD_SIGNALS);
    const results = {}; // { key: [{ el, score, source }] }

    for (const key of fieldKeys) {
      results[key] = [];
      for (const el of controls) {
        if (!isValidControl(el, key)) continue;
        if (key === 'relato' && hasExclusionSignal(el, doc)) continue;
        const { score, source } = scoreElement(el, key, doc);
        if (score >= SCORE_CONFIRM) {
          results[key].push({ el, score, source });
        }
      }
      // Ordenar por score decrescente
      results[key].sort((a, b) => b.score - a.score);
    }

    return results;
  }

  /**
   * Seleciona o melhor candidato por campo, respeitando:
   * - Mesmo elemento não pode ser relato E origem
   * - Empate → nenhum vinculado automaticamente (requer confirmação)
   */
  function resolveCandidates(scanResults) {
    const resolved = {}; // { key: { el, score, source, mode } }
    //  mode: 'auto' | 'confirm' | 'conflict' | 'missing'

    const usedByRelato = null;

    // Primeiro resolver "relato" (mais crítico)
    const relatoCandidates = scanResults['relato'] || [];
    if (relatoCandidates.length > 0) {
      const top = relatoCandidates[0];
      if (top.score >= SCORE_AUTO) {
        // Empate: dois candidatos com score igual ou muito próximo?
        const second = relatoCandidates[1];
        if (second && top.score - second.score < 10) {
          resolved['relato'] = { el: null, score: top.score, source: top.source, mode: 'conflict',
            reason: 'Dois campos igualmente prováveis como texto principal. Confirme qual é o correto.' };
        } else {
          resolved['relato'] = { el: top.el, score: top.score, source: top.source, mode: 'auto' };
        }
      } else if (top.score >= SCORE_CONFIRM) {
        resolved['relato'] = { el: top.el, score: top.score, source: top.source, mode: 'confirm' };
      } else {
        resolved['relato'] = { el: null, score: 0, source: '', mode: 'missing' };
      }
    } else {
      resolved['relato'] = { el: null, score: 0, source: '', mode: 'missing' };
    }

    const relatoEl = resolved['relato']?.el;

    // Resolver campos de origem
    for (const key of Object.keys(FIELD_SIGNALS)) {
      if (key === 'relato') continue;
      const candidates = scanResults[key] || [];

      // Remover o elemento que foi vinculado como relato
      const filtered = relatoEl ? candidates.filter(c => c.el !== relatoEl) : candidates;

      if (filtered.length === 0) {
        resolved[key] = { el: null, score: 0, source: '', mode: 'missing' };
        continue;
      }

      const top = filtered[0];
      const second = filtered[1];

      // Verificar se este elemento já foi usado por outro campo (evitar duplicatas)
      const alreadyUsed = Object.values(resolved).some(r => r.el && r.el === top.el);

      if (alreadyUsed) {
        resolved[key] = { el: null, score: 0, source: '', mode: 'missing' };
        continue;
      }

      if (top.score >= SCORE_AUTO) {
        // Empate muito próximo → pedir confirmação
        if (second && top.score - second.score < 10) {
          resolved[key] = { el: null, score: top.score, source: top.source, mode: 'conflict',
            reason: `Campo "${key}": dois elementos igualmente prováveis. Confirme manualmente.` };
        } else {
          resolved[key] = { el: top.el, score: top.score, source: top.source, mode: 'auto' };
        }
      } else if (top.score >= SCORE_CONFIRM) {
        resolved[key] = { el: top.el, score: top.score, source: top.source, mode: 'confirm' };
      } else {
        resolved[key] = { el: null, score: 0, source: '', mode: 'missing' };
      }
    }

    return resolved;
  }

  // ── Localização do iframe ─────────────────────────────────────────────────
  function findMainIframe() {
    for (const sel of IFRAME_SELECTORS) {
      try {
        const el = document.querySelector(sel);
        if (el && el.tagName === 'IFRAME') return el;
      } catch (_) {}
    }
    // Fallback: primeiro iframe visível da página
    const iframes = [...document.querySelectorAll('iframe')];
    for (const fr of iframes) {
      if (fr.offsetWidth > 200 || fr.offsetHeight > 200) return fr;
    }
    return null;
  }

  /**
   * Tenta obter o contentDocument do iframe.
   * Retorna null se cross-origin ou não carregado.
   */
  function getFrameDoc(iframeEl) {
    if (!iframeEl) return null;
    try {
      const doc = iframeEl.contentDocument;
      if (!doc || !doc.body) return null;
      // Verificar se é uma página real (não about:blank vazia)
      if (doc.URL === 'about:blank' && !doc.body.childNodes.length) return null;
      return doc;
    } catch (_) {
      // cross-origin
      return null;
    }
  }

  /**
   * Verifica se a URL do iframe aponta para o formulário de atendimento.
   */
  function isFormUrl(iframeEl) {
    try {
      const src = iframeEl.contentWindow?.location?.href || iframeEl.src || '';
      return SADE_FORM_PATHS.some(p => p.test(src));
    } catch (_) {
      // cross-origin: verificar apenas o atributo src
      try {
        return SADE_FORM_PATHS.some(p => p.test(iframeEl.src || ''));
      } catch (_) { return false; }
    }
  }

  // ── Conversão de elemento em descrição bindings.js ────────────────────────
  /**
   * Usa bindings.describe() para criar a referência persistível.
   * Funciona com o contexto de iframe.
   */
  function describeInFrame(el, iframeEl) {
    const b = globalThis.RelatoAgilBindings;
    if (!b?.describe) return null;
    try {
      // describe() sobe a cadeia de contextos automaticamente até o document raiz
      return b.describe(el, document);
    } catch (err) {
      return null;
    }
  }

  // ── Emissão de eventos ────────────────────────────────────────────────────
  function emit(payload) {
    try {
      window.dispatchEvent(new CustomEvent(EVENT_OUT, { detail: payload }));
    } catch (_) {}
  }

  /**
   * Mapeia o estado interno para o payload enviado ao content.js.
   */
  function buildStatusPayload() {
    const fields = {};
    for (const [key, candidate] of Object.entries(state.candidates)) {
      const isConfirmed = state.confirmed[key];
      fields[key] = {
        mode: isConfirmed ? 'auto' : (candidate.mode || 'missing'),
        score: candidate.score || 0,
        source: candidate.source || '',
        reason: candidate.reason || '',
        // Incluir a descrição bindings apenas para campos com elemento resolvido
        description: (candidate.el && state.iframeEl)
          ? describeInFrame(candidate.el, state.iframeEl)
          : null,
      };
    }

    return {
      adapterVersion: ADAPTER_VERSION,
      status: state.status,
      fields,
      iframeFound: !!state.iframeEl,
      formAccessible: !!state.formDoc,
      crossOrigin: state.iframeEl ? !state.formDoc : false,
      message: buildStatusMessage(),
    };
  }

  function buildStatusMessage() {
    switch (state.status) {
      case 'idle':        return 'Verificando sistema…';
      case 'detecting':   return 'SADE detectado — localizando formulário…';
      case 'waiting':     return 'Aguardando formulário de atendimento…';
      case 'unavailable': return 'Formulário SADE inacessível (possível restrição de origem). Use vinculação manual.';
      case 'dismissed':   return 'Reconhecimento automático ignorado. Use configurações para vincular manualmente.';
      case 'partial': {
        const missing = Object.values(state.candidates).filter(c => c.mode === 'missing').length;
        const confirm = Object.values(state.candidates).filter(c => c.mode === 'confirm' || c.mode === 'conflict').length;
        const msgs = [];
        if (confirm > 0) msgs.push(`${confirm} campo(s) necessitam confirmação`);
        if (missing > 0) msgs.push(`${missing} campo(s) não encontrado(s)`);
        return 'SADE parcialmente reconhecido — ' + msgs.join(', ') + '.';
      }
      case 'mapped':
        return 'SADE reconhecido — campos vinculados automaticamente.';
      default:
        return '';
    }
  }

  // ── Lógica principal de mapeamento ────────────────────────────────────────
  function runMapping() {
    const doc = state.formDoc;
    if (!doc) return;

    const scanResults = scanForm(doc);
    const resolved = resolveCandidates(scanResults);
    state.candidates = resolved;

    const modes = Object.values(resolved).map(r => r.mode);
    const hasAuto = modes.some(m => m === 'auto');
    const hasConflict = modes.some(m => m === 'conflict' || m === 'confirm');
    const allMissing = modes.every(m => m === 'missing');

    if (allMissing) {
      state.status = 'waiting'; // Formulário carregado mas sem campos reconhecíveis
    } else if (hasConflict && !hasAuto) {
      state.status = 'partial';
    } else if (hasAuto) {
      // Verificar se o campo crítico "relato" foi mapeado
      const relatoOk = resolved['relato']?.mode === 'auto';
      state.status = relatoOk ? (hasConflict ? 'partial' : 'mapped') : 'partial';
    } else {
      state.status = 'partial';
    }

    emit(buildStatusPayload());
  }

  // ── Observer do formulário interno ────────────────────────────────────────
  function watchFormDoc(doc) {
    if (state.formObserver) {
      try { state.formObserver.disconnect(); } catch (_) {}
    }
    state.formDoc = doc;
    runMapping();

    // Observar mudanças dinâmicas no formulário (jQuery/AJAX pode recriar campos)
    try {
      state.formObserver = new MutationObserver(() => {
        // Debounce: re-mapear 400ms após última mutação
        clearTimeout(state._formMutationTimer);
        state._formMutationTimer = setTimeout(runMapping, 400);
      });
      state.formObserver.observe(doc.documentElement || doc, {
        childList: true,
        subtree: true,
        attributes: false,
      });
    } catch (_) {}
  }

  // ── Observer do iframe principal ──────────────────────────────────────────
  /**
   * Aguarda o iframe carregar e tenta acessar seu conteúdo.
   * Re-tenta quando a URL interna muda (navegação AJAX).
   */
  function watchIframe(iframeEl) {
    state.iframeEl = iframeEl;
    state.status = 'detecting';
    emit(buildStatusPayload());

    function checkFrame() {
      const doc = getFrameDoc(iframeEl);
      if (!doc) {
        // Cross-origin ou não carregado
        if (state.retryCount < 3) {
          state.retryCount++;
          state.status = 'waiting';
          emit(buildStatusPayload());
          return;
        }
        state.status = 'unavailable';
        emit(buildStatusPayload());
        return;
      }

      const onLoad = () => {
        state.retryCount = 0;
        const newDoc = getFrameDoc(iframeEl);
        if (newDoc) {
          state.formDoc = newDoc;
          // Aguardar um ciclo de renderização antes de mapear (jQuery pode preencher depois do load)
          setTimeout(() => watchFormDoc(newDoc), 300);
        }
      };

      // Já carregado?
      if (doc.readyState === 'complete' || doc.readyState === 'interactive') {
        state.formDoc = doc;
        setTimeout(() => watchFormDoc(doc), 300);
      }

      // Monitorar futuros loads (navegação interna SADE)
      try {
        iframeEl.contentWindow.addEventListener('load', onLoad, { capture: false });
        // jQuery/AJAX: alguns sistemas disparam apenas hashchange ou popstate
        iframeEl.contentWindow.addEventListener('hashchange', onLoad, { capture: false });
        iframeEl.contentWindow.addEventListener('popstate', onLoad, { capture: false });
      } catch (_) {}
    }

    // Load do iframe
    iframeEl.addEventListener('load', checkFrame);
    checkFrame(); // Checar se já está carregado
  }

  // ── Observer do container principal ──────────────────────────────────────
  /**
   * Monitora o document principal aguardando o iframe SADE aparecer.
   * Necessário quando o iframe é criado dinamicamente.
   */
  function watchForIframe() {
    state.status = 'detecting';
    emit(buildStatusPayload());

    // Tentar imediatamente
    const found = findMainIframe();
    if (found) {
      watchIframe(found);
      return;
    }

    // Observar adição do iframe ao DOM
    if (state.observer) {
      try { state.observer.disconnect(); } catch (_) {}
    }
    state.observer = new MutationObserver(() => {
      const el = findMainIframe();
      if (el && el !== state.iframeEl) {
        if (state.observer) {
          state.observer.disconnect();
          state.observer = null;
        }
        watchIframe(el);
      }
    });
    state.observer.observe(document.documentElement, { childList: true, subtree: true });

    state.status = 'waiting';
    emit(buildStatusPayload());
  }

  // ── Comando do content.js (operador confirma/ignora) ─────────────────────
  window.addEventListener(EVENT_IN, (event) => {
    const cmd = event?.detail;
    if (!cmd || typeof cmd !== 'object') return;

    if (cmd.type === 'confirm') {
      // Operador confirma um campo sugerido
      const key = String(cmd.key || '');
      if (state.candidates[key] && state.candidates[key].el) {
        state.confirmed[key] = true;
        state.candidates[key].mode = 'auto';
        // Recalcular status global
        const modes = Object.values(state.candidates).map(r => r.mode);
        const hasConflict = modes.some(m => m === 'conflict' || m === 'confirm');
        const relatoOk = state.candidates['relato']?.mode === 'auto';
        state.status = relatoOk ? (hasConflict ? 'partial' : 'mapped') : 'partial';
        emit(buildStatusPayload());
      }
    }

    if (cmd.type === 'dismiss') {
      // Operador opta por não usar o reconhecimento automático
      state.dismissed = true;
      state.status = 'dismissed';
      emit(buildStatusPayload());
    }

    if (cmd.type === 'rescan') {
      // Solicitar nova varredura (ex.: após mudança de tela)
      state.dismissed = false;
      state.confirmed = {};
      state.retryCount = 0;
      if (state.formDoc) {
        runMapping();
      } else {
        watchForIframe();
      }
    }

    if (cmd.type === 'ping') {
      // content.js pediu status atual
      emit(buildStatusPayload());
    }
  });

  // ── Inicialização ─────────────────────────────────────────────────────────
  function init() {
    if (!isSadePage()) {
      state.status = 'idle';
      emit(buildStatusPayload());
      // Observa se o container do SADE surge logo após injeção (ex.: carregamento SPA assíncrono)
      const lateObs = new MutationObserver(() => {
        if (isSadePage()) {
          lateObs.disconnect();
          watchForIframe();
        }
      });
      try {
        lateObs.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(() => { try { lateObs.disconnect(); } catch (_) {} }, 4000);
      } catch (_) {}
      return;
    }

    // Aguardar o DOM estar pronto
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', watchForIframe, { once: true });
    } else {
      watchForIframe();
    }
  }

  // Garantir execução única mesmo se o script for reinjetado
  if (window.__sadeAdapter57) {
    // Emitir ping para atualizar o content.js sem reinicializar
    window.dispatchEvent(new CustomEvent(EVENT_IN, { detail: { type: 'ping' } }));
    return;
  }
  window.__sadeAdapter57 = true;

  init();
})();
