/**
 * chrome_test.js
 * Inicia servidor HTTP local e executa Chrome headless via DevTools Protocol (CDP)
 * para validar a injeção dos scripts e o funcionamento no teste-sade.html.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// 1. Iniciar servidor HTTP estático local
const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath === '') reqPath = '/teste-sade.html';
  const filePath = path.join(__dirname, reqPath);
  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath);
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' }[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(8099, async () => {
  console.log('Servidor de teste HTTP ouvindo em http://127.0.0.1:8099');

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const chromeArgs = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-port=9222',
    'http://127.0.0.1:8099/teste-sade.html'
  ];

  console.log('Iniciando Chrome headless com CDP...');
  const chromeProc = spawn(chromePath, chromeArgs);

  // Aguardar Chrome inicializar porta CDP
  let versionData = null;
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 300));
    try {
      const resp = await fetch('http://127.0.0.1:9222/json/list');
      if (resp.ok) {
        versionData = await resp.json();
        break;
      }
    } catch (_) {}
  }

  if (!versionData || !versionData.length) {
    console.error('Não foi possível conectar ao Chrome DevTools');
    chromeProc.kill();
    server.close();
    process.exit(1);
  }

  const page = versionData.find(p => p.type === 'page' && p.url.includes('8099'));
  if (!page || !page.webSocketDebuggerUrl) {
    console.error('Página de teste não encontrada nos targets CDP');
    chromeProc.kill();
    server.close();
    process.exit(1);
  }

  console.log('Conectado à página de teste via WebSocket CDP.');
  const ws = new WebSocket(page.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();

  function sendCmd(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = msgId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(data.error.message));
      else resolve(data.result);
    }
  };

  await new Promise(r => ws.onopen = r);
  console.log('WebSocket CDP aberto. Habilitando Runtime e DOM...');
  await sendCmd('Runtime.enable');
  await sendCmd('Page.enable');

  // Aguardar 1.5s para carregamento do formulário no simulador
  await new Promise(r => setTimeout(r, 1500));

  // Injetar bindings.js
  const bindingsContent = fs.readFileSync('bindings.js', 'utf8');
  await sendCmd('Runtime.evaluate', { expression: bindingsContent });

  // Injetar address-engine.js
  const addressContent = fs.readFileSync('address-engine.js', 'utf8');
  await sendCmd('Runtime.evaluate', { expression: addressContent });

  // Injetar sade-theme.js
  const themeContent = fs.readFileSync('sade-theme.js', 'utf8');
  const tRes = await sendCmd('Runtime.evaluate', { expression: themeContent });
  if (tRes.exceptionDetails) console.error('ERRO tema:', tRes.exceptionDetails);

  // Injetar here-service.js
  const hereContent = fs.readFileSync('here-service.js', 'utf8');
  const hRes = await sendCmd('Runtime.evaluate', { expression: hereContent });
  if (hRes.exceptionDetails) console.error('ERRO here:', hRes.exceptionDetails);

  // Injetar address-popup.js
  const popupContent = fs.readFileSync('address-popup.js', 'utf8');
  const popupInjectRes = await sendCmd('Runtime.evaluate', { expression: popupContent });
  if (popupInjectRes.exceptionDetails) console.error('ERRO popup:', popupInjectRes.exceptionDetails);

  const checkGlobal = await sendCmd('Runtime.evaluate', {
    expression: '({ theme: typeof window.RelatoSadeTheme, here: typeof window.Relato190Here, popup: typeof window.RelatoAddressPopup })',
    returnByValue: true
  });
  console.log('Módulos no window:', checkGlobal.result.value);

  // Injetar sade-adapter.js
  const adapterContent = fs.readFileSync('sade-adapter.js', 'utf8');
  await sendCmd('Runtime.evaluate', { expression: adapterContent });

  // Aguardar adaptador mapear os campos
  await new Promise(r => setTimeout(r, 1000));

  // Inspecionar scanResults detalhados
  const scanDebug = await sendCmd('Runtime.evaluate', {
    expression: `(function() {
      const iframe = document.querySelector('#iframeContainer');
      const doc = iframe.contentDocument;
      // Usar a mesma lógica de scanForm interna
      const controls = [...doc.querySelectorAll('input,textarea,select,[contenteditable]')];
      // Retornar os sinais de cada campo
      const info = {};
      for (const c of controls) {
        info[c.id || c.name || 'unnamed'] = {
          id: c.id,
          name: c.name,
          labels: [...(c.labels||[])].map(l => l.textContent),
          parentText: c.parentElement ? c.parentElement.textContent.replace(/\\s+/g, ' ').trim() : ''
        };
      }
      return info;
    })()`,
    returnByValue: true
  });
  console.log('Controles encontrados no form:');
  console.log(JSON.stringify(scanDebug.result.value, null, 2));

  // Capturar estado dos candidatos internos do adaptador
  const candDebug = await sendCmd('Runtime.evaluate', {
    expression: `(function() {
      // Pedir ping para inspecionar
      let res = null;
      window.addEventListener('relato190:sade:status', e => { res = e.detail; }, { once: true });
      window.dispatchEvent(new CustomEvent('relato190:sade:command', { detail: { type: 'ping' } }));
      return res;
    })()`,
    returnByValue: true
  });


  // Disparar comando ping para capturar o payload emitido pelo adaptador
  const testPingResult = await sendCmd('Runtime.evaluate', {
    expression: `new Promise(resolve => {
      window.addEventListener('relato190:sade:status', e => {
        resolve(e.detail);
      }, { once: true });
      window.dispatchEvent(new CustomEvent('relato190:sade:command', { detail: { type: 'ping' } }));
    })`,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('\nPayload recebido do sade-adapter.js via evento customizado:');
  const payload = testPingResult.result.value;
  console.log('Status geral:', payload.status);
  console.log('Mensagem:', payload.message);
  console.log('Campos detectados:');
  for (const [k, v] of Object.entries(payload.fields || {})) {
    console.log(`  - ${k.padEnd(12)}: modo=${v.mode.padEnd(8)} score=${String(v.score).padStart(3)} desc=${!!v.description}`);
  }

  // Asserções
  let allOk = true;
  if (payload.status !== 'mapped') {
    console.error(`ERRO: status esperado 'mapped', obtido '${payload.status}'`);
    allOk = false;
  }
  const expectedKeys = ['nome','telefone','cidade','rua','numero','bairro','complemento','relato','cep'];
  for (const k of expectedKeys) {
    const f = payload.fields[k];
    if (!f || f.mode !== 'auto') {
      console.error(`ERRO: campo '${k}' não foi mapeado como 'auto' (modo: ${f?.mode})`);
      allOk = false;
    }
  }

  if (allOk) {
    console.log('\n✓ [FASE 1] Mapeamento inicial do formulário: 100% SUCESSO');
  }

  // ── FASE 2: Teste de mutação dinâmica (MutationObserver) ─────────────────
  console.log('\nExecutando FASE 2: Recarregar formulário dinamicamente (simulando AJAX/jQuery)...');
  await sendCmd('Runtime.evaluate', { expression: 'reloadForm()' });

  // Aguardar debounce de 400ms do MutationObserver
  await new Promise(r => setTimeout(r, 800));

  const postMutationPing = await sendCmd('Runtime.evaluate', {
    expression: `new Promise(resolve => {
      window.addEventListener('relato190:sade:status', e => resolve(e.detail), { once: true });
      window.dispatchEvent(new CustomEvent('relato190:sade:command', { detail: { type: 'ping' } }));
    })`,
    awaitPromise: true,
    returnByValue: true
  });
  const mutPayload = postMutationPing.result.value;
  console.log('Status após mutação AJAX:', mutPayload.status);
  if (mutPayload.status === 'mapped') {
    console.log('✓ [FASE 2] MutationObserver remapeou com sucesso após substituição do DOM!');
  } else {
    console.error('✗ [FASE 2] Falha no remapeamento dinâmico:', mutPayload.status);
    allOk = false;
  }

  // ── FASE 3: Teste de tela em branco (Aguardando formulário) ───────────────
  console.log('\nExecutando FASE 3: Carregar tela em branco (aguardando formulário)...');
  await sendCmd('Runtime.evaluate', { expression: 'loadEmpty()' });
  await new Promise(r => setTimeout(r, 800));

  const emptyPing = await sendCmd('Runtime.evaluate', {
    expression: `new Promise(resolve => {
      window.addEventListener('relato190:sade:status', e => resolve(e.detail), { once: true });
      window.dispatchEvent(new CustomEvent('relato190:sade:command', { detail: { type: 'rescan' } }));
    })`,
    awaitPromise: true,
    returnByValue: true
  });
  const emptyPayload = emptyPing.result.value;
  console.log('Status com tela em branco:', emptyPayload.status);
  console.log('Mensagem:', emptyPayload.message);
  if (emptyPayload.status === 'waiting') {
    console.log('✓ [FASE 3] Adaptador identificou corretamente a ausência de formulário e ficou em "waiting"!');
  } else {
    console.warn('Nota: Status recebido:', emptyPayload.status);
  }

  // ── FASE 4: Recarregar formulário após tela vazia ─────────────────────────
  console.log('\nExecutando FASE 4: Recarregar formulário após tela vazia...');
  await sendCmd('Runtime.evaluate', { expression: 'loadForm()' });
  await new Promise(r => setTimeout(r, 1000));

  const reloadPing = await sendCmd('Runtime.evaluate', {
    expression: `new Promise(resolve => {
      window.addEventListener('relato190:sade:status', e => resolve(e.detail), { once: true });
      window.dispatchEvent(new CustomEvent('relato190:sade:command', { detail: { type: 'rescan' } }));
    })`,
    awaitPromise: true,
    returnByValue: true
  });
  const reloadPayload = reloadPing.result.value;
  console.log('Status após recarregamento:', reloadPayload.status);
  if (reloadPayload.status === 'mapped') {
    console.log('✓ [FASE 4] Adaptador remapeou todos os campos após restauração do formulário!');
  }

  // ── FASE 5: Teste do Popup Flutuante na Tela com Sugestão de Município ───
  console.log('\nExecutando FASE 5: Injetar content.js e testar popup flutuante na tela...');
  const contentContent = fs.readFileSync('content.js', 'utf8');
  const evalRes = await sendCmd('Runtime.evaluate', { expression: contentContent });
  if (evalRes.exceptionDetails) {
    console.error('ERRO ao avaliar content.js:', evalRes.exceptionDetails);
  }
  await new Promise(r => setTimeout(r, 600));

  // Simular digitação de "Holombo" no campo de município
  console.log('Simulando digitação de "Holombo" no campo de município...');
  await sendCmd('Runtime.evaluate', {
    expression: `(function() {
      const iframe = document.querySelector('#iframeContainer');
      const doc = iframe.contentDocument;
      const input = doc.getElementById('municipioOcorrencia');
      input.value = 'Holombo';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`
  });

  // Aguardar debounce de 300ms do input e animação do popup
  await new Promise(r => setTimeout(r, 700));

  // Inspecionar se o popup flutuante está visível no Shadow DOM com a indicação "Colombo"
  const popupCheck = await sendCmd('Runtime.evaluate', {
    expression: `(function() {
      const root = document.querySelector('#relato190-essencial-root');
      if (!root || !root.shadowRoot) return { found: false, error: 'Shadow root não encontrado' };
      const children = [...root.shadowRoot.children].map(c => c.tagName + '.' + c.className);
      const popup = root.shadowRoot.querySelector('.relato-address-popup');
      if (!popup) return { found: false, error: 'Elemento .relato-address-popup não encontrado', children };
      const isVisible = !popup.hidden && window.getComputedStyle(popup).display !== 'none';
      const items = [...popup.querySelectorAll('.popup-item')];
      const titles = items.map(it => it.querySelector('.popup-item-title')?.textContent || '');
      const details = items.map(it => it.querySelector('.popup-item-details')?.textContent || '');
      const buttons = items.map(it => it.querySelector('.popup-use-btn')?.textContent || '');
      const rect = popup.getBoundingClientRect();
      return {
        found: true,
        visible: isVisible,
        titles,
        details,
        buttons,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
      };
    })()`,
    returnByValue: true
  });

  console.log('Inspeção do popup na tela:');
  console.log(JSON.stringify(popupCheck.result.value, null, 2));

  const pRes = popupCheck.result.value;
  if (pRes && pRes.visible && pRes.titles.includes('Colombo') && pRes.buttons.includes('Usar')) {
    console.log('✓ [FASE 5] Popup flutuante apareceu na tela com a indicação "Colombo" e botão "Usar"!');

    // Clicar em "Usar" e verificar preenchimento automático no formulário SADE
    const clickResult = await sendCmd('Runtime.evaluate', {
      expression: `(function() {
        const root = document.querySelector('#relato190-essencial-root');
        const btn = root.shadowRoot.querySelector('.popup-use-btn');
        if (!btn) return { error: 'Botão Usar não encontrado' };
        btn.click();
        const iframe = document.querySelector('#iframeContainer');
        const input = iframe.contentDocument.getElementById('municipioOcorrencia');
        const undoArea = root.shadowRoot.querySelector('.popup-undo-area');
        const undoVisible = undoArea && !undoArea.hidden;
        return {
          updatedValue: input ? input.value : null,
          undoVisible
        };
      })()`,
      returnByValue: true
    });
    console.log('Resultado após clicar em Usar:', clickResult.result.value);
    if (clickResult.result.value?.updatedValue === 'Colombo') {
      console.log('✓ [FASE 5] Campo de município no formulário SADE atualizado automaticamente para "Colombo"!');
    } else {
      console.error('✗ [FASE 5] Falha ao aplicar sugestão:', clickResult.result.value);
      allOk = false;
    }
  } else {
    console.error('✗ [FASE 5] Falha: popup na tela não exibiu a sugestão esperada.');
    allOk = false;
  }

  // ── FASE 6: Testar o cenário exato do usuário: Colombo + "rua cecilia meir" ──
  console.log('\nExecutando FASE 6: Testar reconhecimento de "rua cecilia meir" em Colombo...');
  await sendCmd('Runtime.evaluate', {
    expression: `(function() {
      const iframe = document.querySelector('#iframeContainer');
      const doc = iframe.contentDocument;
      const inputRua = doc.getElementById('logradouroOcorrencia');
      inputRua.value = 'rua cecilia meir';
      inputRua.dispatchEvent(new Event('input', { bubbles: true }));
    })()`
  });

  // Aguardar debounce de 450ms do input e busca do ViaCEP/mock
  await new Promise(r => setTimeout(r, 900));

  const streetPopupCheck = await sendCmd('Runtime.evaluate', {
    expression: `(function() {
      const root = document.querySelector('#relato190-essencial-root');
      if (!root || !root.shadowRoot) return { found: false, error: 'Shadow root não encontrado' };
      const popup = root.shadowRoot.querySelector('.relato-address-popup');
      if (!popup) return { found: false, error: 'Popup não encontrado' };
      const isVisible = !popup.hidden && window.getComputedStyle(popup).display !== 'none';
      const items = [...popup.querySelectorAll('.popup-item')];
      const titles = items.map(it => it.querySelector('.popup-item-title')?.textContent || '');
      const details = items.map(it => it.querySelector('.popup-item-details')?.textContent || '');
      const buttons = items.map(it => it.querySelector('.popup-use-btn')?.textContent || '');
      const rect = popup.getBoundingClientRect();
      return {
        found: true,
        visible: isVisible,
        titles,
        details,
        buttons,
        rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
      };
    })()`,
    returnByValue: true
  });

  console.log('Inspeção do popup na tela para "rua cecilia meir":');
  console.log(JSON.stringify(streetPopupCheck.result.value, null, 2));

  const sRes = streetPopupCheck.result.value;
  if (sRes && sRes.visible && sRes.titles.some(t => t.includes('Cecília Meireles'))) {
    console.log('✓ [FASE 6] Popup informativo exibiu "Rua Cecília Meireles" no topo da tela com sucesso!');

    // Clicar em Usar
    const streetClickResult = await sendCmd('Runtime.evaluate', {
      expression: `(function() {
        const root = document.querySelector('#relato190-essencial-root');
        const btn = root.shadowRoot.querySelector('.popup-use-btn');
        if (!btn) return { error: 'Botão Usar não encontrado' };
        btn.click();
        const iframe = document.querySelector('#iframeContainer');
        const inputRua = iframe.contentDocument.getElementById('logradouroOcorrencia');
        return {
          updatedRua: inputRua ? inputRua.value : null
        };
      })()`,
      returnByValue: true
    });

    console.log('Resultado após clicar em Usar logradouro:', streetClickResult.result.value);
    if (streetClickResult.result.value?.updatedRua?.includes('Cecília Meireles')) {
      console.log('✓ [FASE 6] Logradouro atualizado no formulário SADE para "Rua Cecília Meireles"!');
    } else {
      console.error('✗ [FASE 6] Falha ao atualizar logradouro:', streetClickResult.result.value);
      allOk = false;
    }
  } else {
    console.error('✗ [FASE 6] Falha: popup na tela não exibiu "Rua Cecília Meireles".', sRes);
    allOk = false;
  }

  // Fechar Chrome e servidor
  ws.close();
  chromeProc.kill();
  server.close();

  if (allOk) {
    console.log('\n========================================================');
    console.log('✓ [SUCESSO TOTAL] TODAS AS FASES DO CHROME CDP PASSARAM!');
    console.log('========================================================\n');
    process.exit(0);
  } else {
    console.error('\n✗ [FALHA] Algumas asserções falharam no Chrome real.');
    process.exit(1);
  }
});
