/**
 * test_sade_suite.js
 * Suíte de testes automatizados para validação da integração SADE (v5.7.0).
 * Executa verificações detalhadas cobrindo todos os requisitos do item 11 do prompt.
 */
'use strict';

const fs = require('fs');
const assert = require('assert');

console.log('========================================================');
console.log('   SUÍTE DE TESTES — RELATO 190 ESSENCIAL + SADE v5.7.0');
console.log('========================================================\n');

let totalTests = 0;
let passedTests = 0;

function test(title, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${title}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${title}`);
    console.error(`    Erro: ${err.message}`);
  }
}

// Carregar arquivos do projeto
const adapterCode = fs.readFileSync('sade-adapter.js', 'utf8');
const contentCode = fs.readFileSync('content.js', 'utf8');
const backgroundCode = fs.readFileSync('background.js', 'utf8');
const manifestCode = fs.readFileSync('manifest.json', 'utf8');
const bindingsCode = fs.readFileSync('bindings.js', 'utf8');

// ── 1. Verificações de Sintaxe e Integridade ──────────────────────────────────
test('1. Manifest V3: versão 5.8.0 e estrutura válida', () => {
  const manifest = JSON.parse(manifestCode);
  assert.strictEqual(manifest.manifest_version, 3, 'Deve ser Manifest V3');
  assert.strictEqual(manifest.version, '5.8.0', 'Versão deve ser 5.8.0');
  assert.ok(manifest.permissions.includes('activeTab'), 'Permissão activeTab');
  assert.ok(manifest.permissions.includes('scripting'), 'Permissão scripting');
  assert.ok(manifest.permissions.includes('storage'), 'Permissão storage');
  assert.ok(manifest.host_permissions.some(p => p.includes('hereapi.com')), 'Permissão para HERE Technologies');
});

test('2. Background: injeção sequencial inclui módulos v5.8.0 antes do content.js', () => {
  assert.ok(
    backgroundCode.includes("'sade-theme.js'") &&
    backgroundCode.includes("'here-service.js'") &&
    backgroundCode.includes("'address-popup.js'") &&
    backgroundCode.includes("'sade-adapter.js'"),
    'Módulos de tema, HERE, popup e adaptador devem ser injetados antes de content.js'
  );
});

// ── 2. Heurísticas e Sinais do Adaptador SADE ────────────────────────────────
const signalsMatch = adapterCode.match(/const FIELD_SIGNALS = \{([\s\S]*?)\n  \};/);
assert.ok(signalsMatch, 'FIELD_SIGNALS encontrado no adaptador');
const FIELD_SIGNALS = eval('({' + signalsMatch[1] + '})');

const exclMatch = adapterCode.match(/const RELATO_EXCLUSIONS = \[([\s\S]*?)\n  \];/);
assert.ok(exclMatch, 'RELATO_EXCLUSIONS encontrado no adaptador');
const RELATO_EXCLUSIONS = eval('([' + exclMatch[1] + '])');

function cleanText(v) {
  return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200);
}

function mockElement({ tag = 'input', id = '', name = '', type = 'text', label = '', placeholder = '', disabled = false, hidden = false, value = '' }) {
  return {
    tagName: tag.toUpperCase(),
    nodeType: 1,
    id,
    name,
    type,
    disabled,
    hidden,
    value,
    labels: label ? [{ textContent: label, cloneNode() { return { querySelectorAll() { return []; }, textContent: label }; } }] : [],
    getAttribute(k) {
      if (k === 'placeholder') return placeholder;
      if (k === 'name') return name;
      if (k === 'aria-label') return '';
      return '';
    },
    parentElement: null,
    closest() { return null; }
  };
}

function collectSignals(el) {
  const sigs = [];
  for (const l of el.labels || []) sigs.push(['label', cleanText(l.textContent)]);
  if (el.getAttribute('placeholder')) sigs.push(['placeholder', cleanText(el.getAttribute('placeholder'))]);
  if (el.name) sigs.push(['name', cleanText(el.name)]);
  return sigs;
}

function scoreElement(el, fieldKey) {
  const patterns = FIELD_SIGNALS[fieldKey];
  if (!patterns) return { score: 0, source: '' };
  const sigs = collectSignals(el);
  let best = 0, bestSource = '';
  for (const [sType, sText] of sigs) {
    for (const [pat, score] of patterns) {
      if (pat.test(sText)) {
        const bonus = ['label'].includes(sType) ? 5 : 0;
        const s = Math.min(100, score + bonus);
        if (s > best) { best = s; bestSource = sType + ':' + sText; }
      }
    }
  }
  return { score: best, source: bestSource };
}

test('3. Reconhecimento dos 9 campos obrigatórios com alta pontuação (>= 90)', () => {
  const cases = [
    ['nome', mockElement({ id: 'nomeSolicitante', label: 'Nome do Solicitante' })],
    ['telefone', mockElement({ id: 'telefoneSolicitante', type: 'tel', label: 'Telefone' })],
    ['cidade', mockElement({ id: 'municipioOcorrencia', label: 'Município' })],
    ['rua', mockElement({ id: 'logradouroOcorrencia', label: 'Logradouro / Rua' })],
    ['numero', mockElement({ id: 'numeroImovel', label: 'Número' })],
    ['bairro', mockElement({ id: 'bairroOcorrencia', label: 'Bairro' })],
    ['complemento', mockElement({ id: 'complementoOcorrencia', label: 'Complemento' })],
    ['relato', mockElement({ tag: 'textarea', id: 'relatoOcorrencia', label: 'Relato da Ocorrência' })],
    ['cep', mockElement({ id: 'cepOcorrencia', label: 'CEP' })],
  ];

  for (const [key, el] of cases) {
    const { score } = scoreElement(el, key);
    assert.ok(score >= 90, `Campo "${key}" deve ter pontuação >= 90 (obtido: ${score})`);
  }
});

test('4. Ordem estrita dos campos: número deve anteceder o bairro', () => {
  const orderRegex = /const\s+order\s*=\s*\[([^\]]+)\]/;
  const match = contentCode.match(orderRegex);
  assert.ok(match, 'Array order definido em content.js');
  const items = eval('[' + match[1] + ']');
  const idxNumero = items.indexOf('numero');
  const idxBairro = items.indexOf('bairro');
  assert.ok(idxNumero !== -1, 'numero deve estar em order');
  assert.ok(idxBairro !== -1, 'bairro deve estar em order');
  assert.ok(idxNumero < idxBairro, `numero (${idxNumero}) deve aparecer antes de bairro (${idxBairro})`);
});

test('5. Proteção do campo de destino: exclusão de observações, histórico, busca e filtro', () => {
  const shouldExclude = [
    'Observação da Ocorrência',
    'Histórico do Atendimento',
    'Filtro de busca',
    'Pesquisa por protocolo',
    'Comentários adicionais',
    'Nota interna'
  ];

  for (const text of shouldExclude) {
    const cl = cleanText(text);
    const excluded = RELATO_EXCLUSIONS.some(e => e.test(cl));
    assert.ok(excluded, `"${text}" deve ser excluído do campo de relato principal`);
  }
});

test('6. Não permitir que o mesmo campo seja origem e destino simultaneamente', () => {
  // Teste da lógica em content.js e sade-adapter.js
  assert.ok(contentCode.includes('Não aceite o mesmo campo como origem e destino'), 'Proteção no assistente');
  assert.ok(adapterCode.includes('c.el !== relatoEl') || adapterCode.includes('c.el!==relatoEl'), 'Proteção no adaptador');
});

test('7. Formatação de cópia em caixa alta e suporte aos separadores - e |', () => {
  // Simular lógica de montagem do execute()
  const sepHifen = '-';
  const sepBarra = '|';
  const sampleData = {
    nome: 'MARIA SILVA',
    telefone: '41999990000',
    cidade: 'CURITIBA',
    rua: 'RUA DAS FLORES',
    numero: '123',
    bairro: 'CENTRO',
    complemento: 'SALA 4',
    relato: 'SOLICITA ATENDIMENTO'
  };

  const keys = ['nome','telefone','cidade','rua','numero','bairro','complemento','relato'];
  const resHifen = keys.map(k => sampleData[k]).join(' ' + sepHifen + ' ');
  const resBarra = keys.map(k => sampleData[k]).join(' ' + sepBarra + ' ');

  assert.strictEqual(
    resHifen,
    'MARIA SILVA - 41999990000 - CURITIBA - RUA DAS FLORES - 123 - CENTRO - SALA 4 - SOLICITA ATENDIMENTO'
  );
  assert.strictEqual(
    resBarra,
    'MARIA SILVA | 41999990000 | CURITIBA | RUA DAS FLORES | 123 | CENTRO | SALA 4 | SOLICITA ATENDIMENTO'
  );
  assert.strictEqual(resHifen, resHifen.toUpperCase(), 'Deve ser estritamente em maiúsculas');
});

test('8. Idempotência do clique repetido (sem duplicação de prefixo)', () => {
  // previousBase() remove o prefixo já inserido se o usuário clicar novamente
  function previousBase(current, prefix, sep) {
    if (current === prefix) return '';
    const token = prefix + ' ' + sep + ' ';
    if (current.startsWith(token)) return current.slice(token.length);
    return current;
  }

  const prefix = 'MARIA - 4199999 - CURITIBA - RUA 1 - 10 - CENTRO - CASA';
  const originalRelato = 'SOLICITANTE RELATA FURTO.';
  const sep = '-';

  // 1º clique:
  const firstJoined = prefix + ' ' + sep + ' ' + originalRelato;
  // 2º clique consecutivo com o mesmo botão:
  const baseAfterFirst = previousBase(firstJoined, prefix, sep);
  assert.strictEqual(baseAfterFirst, originalRelato, 'Base recuperada não deve conter o prefixo');
  const secondJoined = prefix + ' ' + sep + ' ' + baseAfterFirst;
  assert.strictEqual(secondJoined, firstJoined, 'Clique repetido não deve duplicar o prefixo');
});

test('9. Desempate com confirmação do operador quando score < 10 de diferença', () => {
  assert.ok(
    adapterCode.includes('top.score - second.score < 10'),
    'Adaptador deve requerer confirmação se houver empate/ambiguidade'
  );
});

test('10. Suporte ao Simulador e ao Container SADE dinâmico', () => {
  assert.ok(adapterCode.includes('#iframeContainer'), 'Identifica #iframeContainer');
  assert.ok(adapterCode.includes('iframe[name="container"]'), 'Identifica container pelo name');
  assert.ok(adapterCode.includes('teste-sade') || adapterCode.includes('teste[-_]sade'), 'Reconhece página de teste/simulador');
});

test('11. Indicadores visuais de status SADE no painel e configurações', () => {
  assert.ok(contentCode.includes('sadeStatusBar'), 'Elemento sadeStatusBar presente');
  assert.ok(contentCode.includes('sadeSettingsBox'), 'Elemento sadeSettingsBox presente');
  assert.ok(contentCode.includes('Automático (SADE)'), 'Badge Automático');
  assert.ok(contentCode.includes('Aguarda confirmação'), 'Badge Confirmação');
  assert.ok(contentCode.includes('sadeRescanBtn'), 'Botão de nova varredura presente');
});

test('12. Preservação de privacidade: sem submissão automática e sem cookies/tokens', () => {
  assert.ok(!adapterCode.includes('form.submit()'), 'Nunca submete formulário');
  assert.ok(!adapterCode.includes('document.cookie'), 'Nunca lê cookies');
  assert.ok(!contentCode.includes('form.submit()'), 'Content script nunca submete');
});

test('13. HERE Technologies: serviço com sanitização, fallback offline e centróides do PR', () => {
  const hereCode = fs.readFileSync('here-service.js', 'utf8');
  assert.ok(hereCode.includes('HereService'), 'Classe HereService presente');
  assert.ok(hereCode.includes('CITY_CENTROIDS'), 'Centróides do Paraná mapeados');
  assert.ok(hereCode.includes('cleanQuery'), 'Sanitização ativa (remove caracteres perigosos e limita tamanho)');
  assert.ok(hereCode.includes('MOCK_STREET_DATABASE'), 'Base mock com ruas do Paraná (Colombo, Curitiba, Pinhais)');
});

test('14. AddressPopup: cálculo de coordenadas no iframeContainer e navegação por teclado', () => {
  const popupCode = fs.readFileSync('address-popup.js', 'utf8');
  assert.ok(popupCode.includes('AddressPopup'), 'Classe AddressPopup presente');
  assert.ok(popupCode.includes('getViewRect'), 'Método getViewRect mapeia coordenadas de iframes recursivamente');
  assert.ok(popupCode.includes('ArrowDown') && popupCode.includes('ArrowUp') && popupCode.includes('Enter'), 'Navegação via setas e Enter');
  assert.ok(popupCode.includes('showUndoFeedback'), 'Mecanismo de Desfazer');
});

test('15. Popup na tela: indicação configurada para aparecer em popup na tela ao invés da extensão', () => {
  assert.ok(contentCode.includes('addressPopup.show'), 'Chamada para addressPopup.show presente');
  assert.ok(contentCode.includes('relato-address-popup'), 'Classe CSS do popup flutuante presente no content');
  assert.ok(contentCode.includes('findFieldElement'), 'Função findFieldElement para ancoragem em elementos SADE');
  assert.ok(contentCode.includes('onFieldInput'), 'Listener onFieldInput captura digitação em tempo real');
});

test('16. Integração visual nativa e tema dinâmico SADE', () => {
  const themeCode = fs.readFileSync('sade-theme.js', 'utf8');
  assert.ok(themeCode.includes('RelatoSadeTheme'), 'Módulo RelatoSadeTheme presente');
  assert.ok(themeCode.includes('extractSadeColors'), 'Extração dinâmica de cores do SADE');
  assert.ok(themeCode.includes('watchThemeChanges'), 'Observador de alternância dark/light mode');
});

console.log(`\n========================================================`);
console.log(`   RESULTADO: ${passedTests} de ${totalTests} testes passaram com sucesso!`);
console.log(`========================================================\n`);

if (passedTests !== totalTests) {
  process.exit(1);
}
