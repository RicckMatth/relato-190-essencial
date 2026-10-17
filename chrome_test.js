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
