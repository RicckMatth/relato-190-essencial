/* Relato 190 Essencial v5.7.0 — apenas referência de campos e ação única. Sem coleta remota.
 * Adaptador SADE: reconhecimento automático de formulários (sade-adapter.js). */
(() => {
  'use strict';
  if (window.__relatoEssencialInstance) {
    if (!window.__relatoEssencialAutomatic) window.__relatoEssencialInstance.toggle();
    window.__relatoEssencialAutomatic = false;
    return;
  }
  const automatic = window.__relatoEssencialAutomatic === true;
  window.__relatoEssencialAutomatic = false;
  const bindings = globalThis.RelatoAgilBindings;
  const matcher=globalThis.Relato190Address;
  const order = ['nome','telefone','cidade','rua','numero','bairro','complemento','relato'];
  const names = {
    nome:'Nome', telefone:'Telefone', cidade:'Cidade / município', rua:'Rua / logradouro',
    numero:'Número', bairro:'Bairro', complemento:'Complemento', cep:'CEP', relato:'Texto principal'
  };
  let cfg = {fields:{},separator:'-'};
  let selecting = null, wizard = false, wizardIndex = 0, openPanel = !automatic, busy = false, mounted = true;
  let mapsActive = false, mapsTimer = null, mapsLastStamp='', mapsBusy=false, mapsPendingStamp='', mapsObservedStamp='', mapsHoldStamp='', mapsManualPause=false;
  let lookupAllowed=false,lookupTimer=null,lookupScheduledStamp='',lookupBusy=false,lastLookupTime=0,lastLookupSignature='',recentLookup=null,storedProfiles=[];
  let cepCoordinates=null,cepCoordinatesFor=""; // Temporário: coordenadas de CEP são aproximadas, não de uma casa.
  // ── HERE Technologies & Popup Flutuante na Tela ─────────────────────────
  let hereService = null, addressPopup = null, fieldInputTimer = null;
  // ── Estado do adaptador SADE ─────────────────────────────────────────────
  let sadeState = null;    // Último payload recebido do sade-adapter.js
  let sadeBindings = {};   // { key: description } — descrições geradas pelo adaptador
  const SADE_EVENT_OUT = 'relato190:sade:status';
  const SADE_EVENT_IN  = 'relato190:sade:command';
  const municipalityFallback=globalThis.RelatoPRMunicipios||['Pato Branco','Curitiba','Colombo'];
  function municipalityNames(){
    const current=globalThis.RelatoPRMunicipios||municipalityFallback;
    const live=(recentLookup?.results?.municipios||[]).map(x=>x.nome).filter(Boolean);
    return [...new Set([...current,...live])];
  }
  const observed = new WeakSet(), inserted = new WeakMap();
  const host = document.createElement('div');
  host.id = 'relato190-essencial-root';
  const shadow = host.attachShadow({mode:'open'});
  const style = document.createElement('style');
  style.textContent = `
  :host{all:initial;color-scheme:light;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  *{box-sizing:border-box}
  .panel{position:fixed;top:18px;right:18px;width:336px;max-width:calc(100vw - 26px);max-height:calc(100vh - 36px);overflow:auto;background:#fff;border:1px solid #cbdde0;box-shadow:0 18px 55px #082f3b34;border-radius:16px;z-index:2147483646;color:#18333b;pointer-events:auto}
  .panel[hidden],.toolbar[hidden],.selector[hidden],.toast[hidden],.mainView[hidden],.settingsView[hidden]{display:none!important}
  .headActions{display:flex;gap:6px;align-items:center}
  .settingsButton{border:1px solid #c9e0dd;border-radius:8px;background:#e6f4f2;color:#105c53;font-size:15px;width:30px;height:30px;display:grid;place-items:center;cursor:pointer}
  .settingsButton[aria-pressed="true"]{background:#0c786d;color:white;border-color:#0c786d}
  .settingsView h3{font-size:13px;color:#174852;margin:2px 0 6px}
  .settingsIntro{font-size:11px;color:#617e86;line-height:1.5;margin:0 0 9px}
  .settingsBox{border:1px solid #d7e7e7;border-radius:10px;padding:10px 11px;margin-top:12px;background:#f9fcfc}
  .settingsBox .mapLink{margin-top:8px}
  .settingsTitle{font-weight:760;font-size:12px;margin-bottom:7px}
  .head{display:flex;align-items:center;justify-content:space-between;padding:16px 16px 12px;background:linear-gradient(112deg,#f0fbfa,#eff4fa);border-radius:15px 15px 0 0;border-bottom:1px solid #dce9e9}
  .brand{font-size:17px;font-weight:800;letter-spacing:-.5px;color:#103a43}
  .small{font-size:11px;color:#59737b;line-height:1.45}
  .close{border:0;background:#dfebed;color:#1f4650;width:28px;height:28px;border-radius:8px;cursor:pointer;font-weight:700;font-size:16px}
  .body{padding:14px 15px 16px}
  .primary{width:100%;background:#007969;color:white;font-size:13px;font-weight:750;border:1px solid #00695e;border-radius:10px;padding:12px;cursor:pointer}
  .primary:hover{background:#006a5c}.primary:disabled{opacity:.55;cursor:wait}
  .help{font-size:11px;line-height:1.48;color:#536e75;margin:10px 1px 14px}
  .section{display:flex;align-items:center;justify-content:space-between;margin:15px 1px 7px}
  .section strong{font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:#4f6f78}
  .line{display:grid;grid-template-columns:minmax(0,1fr) 88px 26px;gap:6px;align-items:center;margin:5px 0;padding:7px 6px;border:1px solid #e1e9ed;border-radius:9px;background:#fff}
  .line[data-key="relato"]{border-color:#b8ded3;background:#f1f9f6}
  .fieldName{font-size:12px;font-weight:620;color:#29444b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .state{font-size:10px;color:#8b9fa7;display:block;line-height:1.45}
  .state.ok{color:#067363}.state.missing{color:#ad5d1c}
  .link,.clear{font-family:inherit;border:1px solid #c4d8d8;background:#eef8f6;color:#126358;border-radius:6px;padding:6px 3px;font-size:11px;font-weight:700;cursor:pointer}
  .clear{background:#fff;color:#81939d;border-color:#e2e8eb;font-size:15px;padding:3px 0}
  .clear:hover{color:#b43b38;border-color:#e7bebc}
  .settings{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:9px 3px 0;color:#4e6b74;font-size:11px}
  select{border:1px solid #c8d7dc;border-radius:7px;background:#fff;color:#1b454e;font:inherit;padding:6px}
  .foot{padding:11px 14px;border-top:1px solid #e5edef;background:#f8fbfc;border-radius:0 0 15px 15px;font-size:10px;color:#6f858c;line-height:1.4}
  .mapsLink{width:100%;border:1px solid #a8d7ce;background:#e8f7f2;color:#006a5b;padding:11px;border-radius:9px;font-weight:750;cursor:pointer}
  .mapsLink:hover{background:#d9f1e8}
  .mapsStatus{margin:8px 1px 12px;font-size:11px;line-height:1.5;color:#56747b}
  .mapsStatus[data-connected="1"]{color:#087365}
  .mapsActions{display:flex;gap:7px}
  .mapsActions button{flex:1;min-width:0;border:1px solid #c7dfda;background:#f4fbf8;color:#14685a;padding:8px 6px;border-radius:7px;font-size:11px;font-weight:750;cursor:pointer}
  .mapsActions button:disabled{opacity:.5;cursor:not-allowed}
  .notice{border-radius:9px;background:#fff8e9;border:1px solid #f0dfb8;padding:9px 11px;font-size:10px;color:#866328;line-height:1.5;margin-top:12px}
  .wizard{width:100%;margin-top:8px;background:#e5f5f0;border:1px solid #b7e0d7;color:#075c52;padding:10px;border-radius:9px;font:750 12px inherit;cursor:pointer}
  .wizard:hover{background:#d4f0e8}
  .toolbar{position:fixed;display:flex;align-items:center;gap:7px;background:#0d353b;max-width:calc(100vw - 16px);box-shadow:0 9px 24px #012e3b44;border:1px solid #416c6e;border-radius:10px;padding:6px 8px;z-index:2147483647;pointer-events:auto;user-select:none}
  .toolbar.dragging{box-shadow:0 14px 35px #012e3b88;border-color:#4ccbbb}
  .toolbar .dragHandle{font-size:16px;line-height:1;letter-spacing:-3px;font-weight:850;padding:7px 9px 7px 6px;background:#214b52;border:1px solid #547e82;cursor:grab;touch-action:none;user-select:none;flex-shrink:0}
  .toolbar .dragHandle:active{cursor:grabbing}
  .toolbar .resetHandle{background:#26585e;color:#e2faf4;font-size:16px;padding:7px 9px;line-height:1}
  .toolbar.isFree{border-color:#3ccab6}
  .toolbar button:focus-visible{outline:2px solid #f1e28c;outline-offset:2px}
  .toolbar button{background:#00a38b;color:white;border:0;border-radius:7px;font:750 12px Inter,system-ui,sans-serif;padding:8px 12px;cursor:pointer;white-space:nowrap}
  .toolbar button:hover{background:#008975}
  .toolbar .gear{font-size:16px;font-weight:600;padding:5px 8px;background:#28585d}
  .toolbar .mini{font-size:11px;font-weight:650;color:#c9eeec;white-space:nowrap}
  .selector{position:fixed;z-index:2147483647;left:50%;top:16px;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 20px);background:#0e3b46;color:#fff;box-shadow:0 9px 28px #0e303a55;border-radius:11px;padding:11px 14px;pointer-events:auto;font:600 13px Inter,system-ui,sans-serif}
  .selector button{background:#fff;color:#174851;border:0;padding:5px 9px;border-radius:6px;cursor:pointer;margin-left:8px}
  .toast{position:fixed;bottom:18px;right:18px;max-width:min(400px,calc(100vw - 24px));padding:12px 15px;border-radius:10px;background:#123e4a;color:#fff;box-shadow:0 10px 28px #0e303a44;z-index:2147483647;pointer-events:none;font:600 12px Inter,system-ui,sans-serif}
  /* SADE adapter styles */
  .sadeStatus{margin:8px 1px 4px;padding:8px 10px;border-radius:9px;font-size:11px;line-height:1.5;display:flex;align-items:center;gap:7px;border:1px solid #c5dfd6;background:#edf8f4;color:#0d5a4c}
  .sadeStatus[data-sade="waiting"]{background:#fff9ec;border-color:#e4d59a;color:#7a5c10}
  .sadeStatus[data-sade="unavailable"]{background:#fff0ee;border-color:#e0bab5;color:#8b2c22}
  .sadeStatus[data-sade="partial"]{background:#fff5e6;border-color:#e4c68a;color:#7a4f10}
  .sadeStatus[data-sade="dismissed"]{background:#f5f7f9;border-color:#d5dde3;color:#6b7f87}
  .sadeStatus[hidden]{display:none!important}
  .sadeStatus .sadeIcon{font-size:14px;flex-shrink:0}
  .sadeStatusText{flex:1;min-width:0}
  .sadeDismiss{border:0;background:transparent;color:inherit;opacity:.6;cursor:pointer;font-size:14px;padding:2px 4px;flex-shrink:0;line-height:1}
  .sadeDismiss:hover{opacity:1}
  .sadeFieldBadge{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:2px 5px;border-radius:4px;background:#d4f0e8;color:#0a6b5a;white-space:nowrap}
  .sadeFieldBadge.confirm{background:#fff2db;color:#7a5010}
  .sadeFieldBadge.conflict{background:#fce8e6;color:#8b2c22}
  .sadeFieldBadge.missing{background:#f0f2f4;color:#7a8c92}
  .sadeSettingsBox{border:1px solid #b8dfd5;border-radius:10px;padding:10px 11px;margin-top:12px;background:#f2fbf8}
  .sadeSettingsTitle{font-weight:760;font-size:12px;margin-bottom:7px;color:#0a5a4c}
  .sadeFieldList{display:grid;gap:5px;margin-top:6px}
  .sadeFieldRow{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px;align-items:center;padding:5px 6px;border:1px solid #daeae5;border-radius:7px;background:#fff;font-size:11px}
  .sadeFieldName{font-weight:650;color:#29444b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sadeConfirmBtn{border:1px solid #c2e0d9;background:#e5f4ef;color:#0a6258;padding:4px 7px;border-radius:5px;font:700 10px inherit;cursor:pointer;white-space:nowrap}
  .sadeConfirmBtn:hover{background:#cceee4}
  .sadeRescanBtn{width:100%;margin-top:7px;border:1px solid #b8dfd5;background:#e5f4ef;color:#0a6258;padding:7px;border-radius:7px;font:700 11px inherit;cursor:pointer}
  .sadeRescanBtn:hover{background:#cceee4}

  /* ── Popup Flutuante Contextual Glassmorphism (HERE / Endereço Inteligente) ── */
  .relato-address-popup{position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483647;width:min(520px,calc(100vw - 32px));background:var(--relato-popup-bg,rgba(255,255,255,0.96));backdrop-filter:var(--relato-blur,blur(14px));-webkit-backdrop-filter:var(--relato-blur,blur(14px));border:1px solid var(--relato-popup-border,rgba(180,202,216,0.75));border-radius:14px;box-shadow:var(--relato-popup-shadow,0 14px 42px rgba(15,35,55,0.22));padding:11px 14px;color:var(--relato-text,#132832);font-family:Inter,system-ui,-apple-system,sans-serif;max-height:380px;display:flex;flex-direction:column;pointer-events:auto;animation:relatoPopupSlideDown 150ms ease-out;box-sizing:border-box}
  @keyframes relatoPopupSlideDown{from{opacity:0;transform:translate(-50%,-10px)}to{opacity:1;transform:translate(-50%,0)}}
  .relato-address-popup.pos-above{animation:relatoPopupSlideDown 150ms ease-out}
  .relato-address-popup[hidden]{display:none!important}
  .popup-header{display:flex;align-items:center;gap:7px;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--relato-border,#e2ecf0)}
  .popup-icon{font-size:14px;line-height:1}
  .popup-title{font-size:12px;font-weight:750;color:var(--relato-text,#132832);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .popup-source{font-size:9px;font-weight:750;text-transform:uppercase;letter-spacing:.5px;background:var(--relato-hover,rgba(10,96,144,0.08));color:var(--relato-primary,#0a6090);padding:2px 5px;border-radius:4px;white-space:nowrap}
  .popup-close{border:0;background:transparent;color:var(--relato-text-muted,#728a94);font-size:16px;cursor:pointer;padding:1px 6px;line-height:1;border-radius:4px;transition:background 120ms ease}
  .popup-close:hover{background:var(--relato-hover,rgba(0,0,0,0.06));color:var(--relato-text,#111)}
  .popup-body{overflow-y:auto;max-height:260px;display:flex;flex-direction:column;gap:5px}
  .popup-list{display:flex;flex-direction:column;gap:5px}
  .popup-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;border-radius:9px;cursor:pointer;transition:background 120ms ease,border-color 120ms ease;border:1px solid var(--relato-border,#e0ecec);background:var(--relato-surface,#ffffff);margin-bottom:4px}
  .popup-item:hover,.popup-item.selected{background:var(--relato-hover,#f0f8f6);border-color:var(--relato-selected,#83c6b8)}
  .popup-item-content{flex:1;min-width:0}
  .popup-item-title{font-size:13px;font-weight:750;color:var(--relato-text,#0f3942);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .popup-item-details{font-size:11px;color:var(--relato-text-muted,#628288);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .popup-badge{display:inline-block;font-size:9px;font-weight:700;padding:2px 5px;border-radius:4px;margin-top:3px}
  .popup-badge.badge-exact{background:var(--relato-badge-auto-bg,#d8f3eb);color:var(--relato-badge-auto-text,#085f4e)}
  .popup-badge.badge-warn{background:var(--relato-badge-warn-bg,#fff4dc);color:var(--relato-badge-warn-text,#7d5312);border:1px solid var(--relato-badge-warn-border,#edd59c)}
  .popup-badge.badge-diff{background:var(--relato-badge-diff-bg,#fbeae7);color:var(--relato-badge-diff-text,#872e22);border:1px solid var(--relato-badge-diff-border,#ebc0ba)}
  .popup-use-btn{border:1px solid var(--relato-btn-border,#bfe5db);background:var(--relato-btn-bg,#e8f7f3);color:var(--relato-btn-text,#057062);font-weight:750;font-size:11px;padding:6px 14px;border-radius:7px;cursor:pointer;transition:background 120ms ease,transform 90ms ease;flex-shrink:0}
  .popup-use-btn:hover{background:var(--relato-btn-hover,#d8f2ec);transform:scale(1.03)}
  .popup-footer{padding-top:6px;margin-top:6px;border-top:1px solid var(--relato-border,#e2ecf0);display:flex;align-items:center;justify-content:space-between}
  .popup-hint{font-size:9px;color:var(--relato-text-muted,#728a94)}
  .popup-undo-area{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:4px 0}
  .popup-undo-text{font-size:11px;font-weight:700;color:var(--relato-text,#132832)}
  .popup-undo-btn{background:#e0f0eb;border:1px solid #b7dfd5;color:#0b6152;padding:4px 9px;border-radius:5px;font-size:10px;font-weight:750;cursor:pointer}
  .popup-undo-btn:hover{background:#cfe9e2}



  .assist{border:1px solid #d3e6e5;border-radius:11px;margin-top:12px;overflow:hidden;background:#fbfdfd}
  .assist summary{list-style:none;display:flex;justify-content:space-between;align-items:center;gap:8px;cursor:pointer;color:#26565c;font-size:12px;font-weight:750;padding:11px 12px}
  .assist summary::-webkit-details-marker{display:none}.assist[open] summary{border-bottom:1px solid #e0eaea;background:#f1f9f7}
  .assistBody{padding:10px 11px 12px}.assistBody p{font-size:11px;color:#627f83;line-height:1.5;margin:0 0 10px}
  .assistFlag{font-size:10px;color:#678786;font-weight:600}.fieldLabel{display:block;font-size:11px;font-weight:730;color:#365c62;margin:7px 0 4px}
  .assistInput{width:100%;min-width:0;border:1px solid #cbdedf;border-radius:8px;padding:8px 9px;color:#224950;font-size:12px;background:white}
  .assistCheck{display:flex;align-items:flex-start;gap:7px;color:#416971;font-size:11px;line-height:1.5;cursor:pointer;margin:6px 0 10px}
  .assistCheck input{margin-top:2px;accent-color:#0a8275}.assistAction{width:100%;border:1px solid #badcd5;background:#e5f6f1;color:#116c60;padding:9px 10px;border-radius:8px;font-size:11px;font-weight:750;cursor:pointer}
  .assistAction:disabled{opacity:.5;cursor:wait}.assistInfo{font-size:10px;color:#54767b;line-height:1.5;margin:8px 0}
  .cepResult{margin-top:9px;border:1px solid #b8ded6;border-radius:10px;padding:10px;background:#f0faf7;color:#234950}
  .cepResult[hidden]{display:none!important}.cepResultTitle{font-size:12px;font-weight:800;color:#0b6659;margin:0 0 5px}
  .cepResultLine{font-size:11px;line-height:1.55;margin:2px 0;overflow-wrap:anywhere}
  .cepResultMeta{font-size:10px;color:#55777a;line-height:1.5;margin:5px 0}
  .cepResultWarning{font-size:10px;background:#fff2db;color:#8a581c;padding:6px 7px;border-radius:6px;margin:6px 0;line-height:1.45}
  .cepResultButton{width:100%;margin-top:6px;background:#0a796d;color:white;border:0;border-radius:7px;padding:8px 6px;font-size:11px;font-weight:750;cursor:pointer}
  .assistSuggestions{display:grid;gap:6px;margin-top:9px}.suggestion{border:1px solid #e0ecec;border-radius:9px;background:white;padding:8px;display:flex;gap:7px;justify-content:space-between;align-items:center}
  .suggestion strong{font-size:11px;color:#1e4a52;line-height:1.35;display:block}.suggestion small{font-size:10px;color:#728a8f;line-height:1.4;display:block;margin-top:2px}
  .suggestion button{border:1px solid #c2e4da;background:#e9f7f2;color:#057667;font-weight:700;font-size:10px;padding:6px 8px;cursor:pointer;border-radius:7px;white-space:nowrap}
  .profileBtns{display:flex;gap:5px;margin-top:7px}.profileBtns button{flex:1;border:1px solid #c6ddd9;border-radius:7px;background:#eef7f5;color:#17675c;padding:7px 5px;font-size:10px;font-weight:730;cursor:pointer}
  .settingsBox .assistInput{margin-top:6px}.infoPill{color:#a86712;background:#fff5df;border-radius:7px;padding:7px;font-size:10px;line-height:1.5;margin-top:7px}
  @media(max-width:520px){.panel{top:8px;right:8px;max-height:calc(100vh - 16px)}.toolbar .mini{display:none}}
  `;
  shadow.append(style);
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.innerHTML = `
    <div class="head"><div><div class="brand">Relato 190 <span style="font-size:10px;font-weight:650;color:#57918c">ESSENCIAL</span></div><div class="small" id="viewSubtitle">Copiar e consultar no Google Maps</div></div><div class="headActions"><button class="settingsButton" id="settingsToggle" title="Configurações: vínculos e mapa" aria-label="Abrir configurações" aria-pressed="false">⚙</button><button class="close" title="Fechar painel" aria-label="Fechar painel">×</button></div></div>
    <div class="body">
      <div class="mainView" id="mainView">
      <button class="primary" id="execute">Copiar e inserir tudo</button>
      <button class="mapsLink" id="openmaps" style="margin-top:9px">↗ Abrir Google Maps e acompanhar endereço</button>
      <div class="sadeStatus" id="sadeStatusBar" hidden aria-live="polite"><span class="sadeIcon">&#128269;</span><span class="sadeStatusText" id="sadeStatusText"></span><button class="sadeDismiss" id="sadeDismissBtn" title="Ocultar SADE" aria-label="Ocultar">&#215;</button></div>
      <p class="mapsStatus" id="mapsStatus" aria-live="polite">Mapa desconectado. Abra a aba para iniciar o acompanhamento.</p>
      <div class="mapsActions"><button id="mapsNow" disabled>Atualizar pesquisa</button><button id="mapsPause" disabled>Pausar atualização</button></div>
      <div class="mapsActions" style="margin-top:7px"><button id="streetView" title="Tenta abrir Street View próximo ao endereço usando coordenadas disponíveis; confirme a rua e a fachada no Google Maps.">◉ Abrir Street View</button></div>
      <details class="assist" id="assistDetails"><summary><span>⌕ Endereço inteligente</span><span class="assistFlag" id="assistFlag">Opcional ▾</span></summary>
       <div class="assistBody"><p>Compare nomes semelhantes e confira resultados por CEP. As opções encontradas precisam ser confirmadas antes de alterar o endereço.</p>
       <label class="assistCheck"><input type="checkbox" id="lookupEnable">Autorizar consultas online de <b style="margin-left:3px">endereço</b> nesta sessão (IBGE, ViaCEP e BrasilAPI)</label>
       <label class="fieldLabel" for="manualCep">CEP opcional — 8 dígitos</label><input id="manualCep" class="assistInput" maxlength="9" placeholder="Ex.: 83400-000" inputmode="numeric" autocomplete="off">
       <button class="assistAction" id="verifyAddress" disabled>Conferir em fontes públicas</button>
       <div class="cepResult" id="cepResult" hidden aria-live="polite"></div>
       <div class="assistInfo" id="lookupStatus" aria-live="polite">As sugestões locais não enviam dados. Para verificar ruas ou CEPs online, habilite a consulta.</div>
       <div class="assistSuggestions" id="lookupSuggestions"></div></div></details>
      <div class="notice">Ao ativar, <b>município, rua, número e bairro</b> são enviados ao Google Maps. Nome, telefone, complemento e relato não são enviados. Use somente com autorização institucional; resultados e numeração podem ser aproximados.</div>
      <div class="help">Cópia em um toque: <b>nome · telefone · endereço · relato</b>. Apenas campos vinculados; nenhuma ocorrência é enviada.</div>
      </div>
      <div class="settingsView" id="settingsView" hidden>
      <h3>Configurações</h3><p class="settingsIntro">Gerencie vínculos e preferências. O conteúdo digitado durante o atendimento não é salvo.</p>
      <div class="sadeSettingsBox" id="sadeSettingsBox" hidden>
        <div class="sadeSettingsTitle" id="sadeSettingsTitle">SADE &mdash; reconhecimento autom&aacute;tico</div>
        <p class="settingsIntro" id="sadeSettingsMsg"></p>
        <div class="sadeFieldList" id="sadeFieldList"></div>
        <button class="sadeRescanBtn" id="sadeRescanBtn">&#8635; Nova varredura de campos</button>
      </div>
      <button class="wizard" id="wizard">✚ Vincular todos os campos (assistente)</button>
      <div class="section"><strong>Contato</strong></div><div id="contact"></div>
      <div class="section"><strong>Endereço</strong></div><div id="address"></div>
      <div class="section"><strong>Destino</strong></div><div id="destination"></div>
      <div class="section"><strong>CEP (opcional · não entra na cópia)</strong></div><div id="cepBinding"></div>
      <div class="settings"><label for="sep">Separador do texto</label><select id="sep"><option value="-">Hífen ( - )</option><option value="|">Barra vertical ( | )</option></select></div>
      <div class="settingsBox"><div class="settingsTitle">Perfis inteligentes de campos</div>
        <p class="settingsIntro">Guarde diferentes layouts do mesmo site. Um perfil só é aplicado automaticamente quando os campos são reconhecidos sem ambiguidade.</p>
        <input class="assistInput" id="profileName" maxlength="48" placeholder="Nome do perfil (ex.: Tela de atendimento)">
        <div class="profileBtns"><button id="profileSave">Salvar perfil</button></div>
        <select id="profileList" class="assistInput" aria-label="Perfis salvos"><option value="">Nenhum perfil salvo</option></select>
        <div class="profileBtns"><button id="profileApply">Aplicar</button><button id="profileDelete">Excluir</button></div>
        <label class="assistCheck"><input id="profileAuto" type="checkbox" checked>Reconhecer automaticamente perfis compatíveis</label>
       </div><div class="settingsBox"><div class="settingsTitle">Google Maps</div><p class="settingsIntro">Nenhuma base local é necessária. O acompanhamento só começa depois que você abrir o Maps, e pode ser pausado a qualquer momento.</p></div>
       <div class="settingsBox" id="hereSettingsBox">
         <div class="settingsTitle">Sugestões de Endereço (Popup na Tela)</div>
         <p class="settingsIntro">Exibe sugestões inteligentes em popup na tela ao digitar logradouros ou municípios no SADE. Integração HERE Technologies v7 e base do Paraná.</p>
         <label class="assistCheck"><input id="hereEnabled" type="checkbox" checked>Ativar popup de sugestões flutuante na tela</label>
         <label class="assistCheck"><input id="hereUseMock" type="checkbox" checked>Simulador offline integrado (não consome cota de API)</label>
         <label class="fieldLabel" for="hereApiKey">Chave de API HERE (opcional)</label>
         <input id="hereApiKey" class="assistInput" type="password" placeholder="Insira sua API Key da HERE se possuir" autocomplete="off">
         <div class="profileBtns"><button type="button" id="hereSaveBtn">Salvar preferências</button><button type="button" id="hereTestBtn">Testar popup na tela</button></div>
         <div class="assistInfo" id="hereStatus">Popup configurado para aparecer na tela sobre o campo ativo.</div>
       </div>
      </div>
    </div>
    <div class="foot">Apenas vínculos e preferências são salvos neste site. Dados das ocorrências não são armazenados.</div>`;
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `<button type="button" class="dragHandle" id="moveToolbar" title="Arraste para mover a barra" aria-label="Mover barra: segure e arraste">⠿</button><span class="mini">Relato 190</span><button id="quick" title="Copiar e inserir todos os dados">Copiar + inserir</button><button class="gear" id="quickmap" title="Abrir ou atualizar o Google Maps">↗</button><button class="gear" id="configure" title="Configurar campos">⚙</button><button type="button" class="resetHandle" id="resetToolbar" title="Recolocar a barra abaixo do campo principal" aria-label="Reencaixar barra abaixo do campo principal">↩</button>`;
  const selectionBanner = document.createElement('div');
  selectionBanner.className = 'selector';
  selectionBanner.hidden = true;
  selectionBanner.innerHTML = '<span id="selecttext"></span><button id="skip" hidden>Pular campo</button><button id="cancel">Cancelar (Esc)</button>';
  const toast = document.createElement('div');toast.className='toast';toast.hidden=true;
  shadow.append(panel,toolbar,selectionBanner,toast);
  (document.body||document.documentElement).append(host);
  // Aplicar tema dinâmico SADE imediatamente no Shadow DOM
  if(typeof RelatoSadeTheme!=='undefined'){
    (RelatoSadeTheme.applyTheme||RelatoSadeTheme.apply)(shadow);
    RelatoSadeTheme.watchThemeChanges(shadow);
  }
  // Inicializar serviço HERE Technologies
  if(typeof Relato190Here!=='undefined'&&Relato190Here.HereService){
    hereService=new Relato190Here.HereService({
      apiKey:cfg.hereApiKey||'',
      useMock:cfg.hereUseMock!==false
    });
  }
  // Inicializar Popup Flutuante Contextual na tela imediatamente
  if(typeof RelatoAddressPopup!=='undefined'){
    addressPopup=new RelatoAddressPopup(shadow,{});
  }
  const $=selector=>shadow.querySelector(selector);
  let toastTimeout;
  function show(message) {
    toast.textContent=message;toast.hidden=false;
    clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>toast.hidden=true,4300);
  }
  let settingsVisible=false;
  function showSettings(force){
    settingsVisible=typeof force==='boolean'?force:!settingsVisible;
    $('#mainView').hidden=settingsVisible;
    $('#settingsView').hidden=!settingsVisible;
    $('#settingsToggle').setAttribute('aria-pressed',String(settingsVisible));
    $('#settingsToggle').setAttribute('aria-label',settingsVisible?'Voltar ao painel principal':'Abrir configurações');
    $('#viewSubtitle').textContent=settingsVisible?'Vínculos e preferências':'Copiar e consultar no Google Maps';
    panel.scrollTop=0;
  }
  function toggle(force){openPanel=typeof force==='boolean'?force:!openPanel;panel.hidden=!openPanel;
    if(!openPanel&&lookupAllowed){lookupAllowed=false;$('#lookupEnable').checked=false;$('#verifyAddress').disabled=true;clearTimeout(lookupTimer);$('#lookupStatus').textContent='Consulta externa desativada ao fechar o painel.';}
  }
  window.__relatoEssencialInstance={toggle};
  toggle(openPanel);
  panel.querySelector('.close').addEventListener('click',()=>toggle(false));
  $('#configure').addEventListener('click',()=>{toggle(true);showSettings(true);});
  $('#settingsToggle').addEventListener('click',()=>showSettings());
  $('#openmaps').addEventListener('click',()=>openMaps());
  $('#quickmap').addEventListener('click',()=>openMaps());
  $('#mapsNow').addEventListener('click',()=>syncMaps(true));
  $('#streetView').addEventListener('click',()=>openStreetView());
  $('#lookupEnable').addEventListener('change',()=>{lookupAllowed=$('#lookupEnable').checked;$('#verifyAddress').disabled=!lookupAllowed;if(lookupAllowed){$('#assistDetails').open=true;verifyAddress(true);}else{clearTimeout(lookupTimer);recentLookup=null;cepCoordinates=null;$('#lookupStatus').textContent='Consulta externa desligada.';showSuggestions();}});
  $('#verifyAddress').addEventListener('click',()=>verifyAddress(false));
  $('#manualCep').addEventListener('input',()=>{const digits=matcher.cep($('#manualCep').value);$('#manualCep').value=digits.length>5?digits.slice(0,5)+'-'+digits.slice(5):digits;recentLookup=null;cepCoordinates=null;cepCoordinatesFor='';$('#cepResult').hidden=true;scheduleLookup();});
  $('#profileSave').addEventListener('click',saveProfile);$('#profileApply').addEventListener('click',applySelectedProfile);$('#profileDelete').addEventListener('click',deleteProfile);
  $('#profileAuto').addEventListener('change',e=>{cfg.profileAuto=e.target.checked;persist();});
  $('#hereSaveBtn')?.addEventListener('click',async()=>{
    cfg.hereEnabled=$('#hereEnabled').checked;
    cfg.hereUseMock=$('#hereUseMock').checked;
    cfg.hereApiKey=($('#hereApiKey').value||'').trim();
    if(hereService){
      hereService.apiKey=cfg.hereApiKey;
      hereService.useMock=cfg.hereUseMock;
    }
    await persist();
    show('Preferências de endereço salvas.');
  });
  $('#hereTestBtn')?.addEventListener('click',()=>{
    const target=findFieldElement('cidade')||findFieldElement('rua')||document.activeElement;
    if(addressPopup&&target){
      addressPopup.show(target,[{
        name:'Colombo',
        title:'Colombo',
        subtitle:'Município parecido · confira antes de usar',
        type:'city',
        score:85
      }],{
        title:'Sugestão de Município',
        source:'IBGE / SADE',
        onSelect:(item)=>{
          applySuggestion({cidade:item.name});
        },
        onUndo:(prevVal)=>{
          applySuggestion({cidade:prevVal});
        }
      });
      show('Popup exibido na tela!');
    }
  });
  $('#mapsPause').addEventListener('click',()=>{
    mapsActive=!mapsActive;
    mapsManualPause=!mapsActive;
    if(!mapsActive)clearTimeout(mapsTimer);
    if(mapsActive)mapsHoldStamp='';
    $('#mapsPause').textContent=mapsActive?'Pausar atualização':'Retomar atualização';
    mapsStatus(mapsActive?'Sincronização automática ativada.':'Sincronização pausada; clique em Atualizar pesquisa agora para pesquisar.',true);
    if(mapsActive)scheduleMapsSync(true);
  });
  $('#execute').addEventListener('click',()=>execute());
  $('#quick').addEventListener('click',()=>execute());
  $('#resetToolbar').addEventListener('click',()=>resetToolbar());
  installToolbarDrag();
  $('#cancel').addEventListener('click',()=>stopSelecting(true));
  $('#skip').addEventListener('click',()=>advanceWizard());
  $('#wizard').addEventListener('click',()=>beginWizard());

  const groups = {contact:['nome','telefone'],address:['cidade','rua','numero','bairro','complemento'],destination:['relato'],cepBinding:['cep']};
  for(const [target,keys] of Object.entries(groups)){
    for(const key of keys){
      const row=document.createElement('div');row.className='line';row.dataset.key=key;
      const lhs=document.createElement('div');
      const name=document.createElement('div');name.className='fieldName';name.textContent=names[key];
      const status=document.createElement('span');status.className='state';status.textContent='Não vinculado';
      lhs.append(name,status);
      const btn=document.createElement('button');btn.className='link';btn.textContent='Vincular';btn.title='Escolher campo na página';
      const clear=document.createElement('button');clear.className='clear';clear.textContent='×';clear.title='Remover vínculo';clear.setAttribute('aria-label','Remover vínculo de '+names[key]);
      btn.addEventListener('click',()=>startSelecting(key));
      clear.addEventListener('click',()=>removeField(key));
      row.append(lhs,btn,clear);$('#'+target).append(row);
    }
  }

  function sourceElement(raw){
    if(!raw||raw.nodeType!==1)return null;
    if(raw.tagName==='LABEL'&&raw.control)return raw.control;
    return bindings.control(raw);
  }
  function selectable(el,key){
    if(!el || el===host || host.contains(el))return false;
    if(['BUTTON','SCRIPT','STYLE','OPTION','IFRAME','FRAME','SVG'].includes(el.tagName))return false;
    if(el.tagName==='INPUT'&&!['text','tel','number','search','email','url'].includes(el.type))return false;
    if(key==='relato') return el.tagName==='TEXTAREA'||el.isContentEditable||el.tagName==='INPUT'&&['text','search'].includes(el.type);
    if(['INPUT','TEXTAREA','SELECT'].includes(el.tagName)||el.isContentEditable)return true;
    return ['DIV','SPAN','P','TD','TH','STRONG','B','DD','LI','A'].includes(el.tagName);
  }
  let trackedDocs = [];
  function beginWizard(){
    stopSelecting(true);wizard=true;wizardIndex=0;
    toggle(true);selectWizardStep();
  }
  function selectWizardStep(){
    if(!wizard)return;
    while(wizardIndex<order.length&&findFieldElement(order[wizardIndex]))wizardIndex++;
    if(wizardIndex>=order.length){
      wizard=false;stopSelecting();render();show('Assistente finalizado. Vínculos salvos neste site.');return;
    }
    startSelecting(order[wizardIndex],true);
  }
  function advanceWizard(){
    if(!wizard)return;
    wizardIndex++;
    // Todos os vínculos válidos são salvos individualmente, inclusive se o assistente for cancelado.
    stopSelecting(false);
    selectWizardStep();
  }
  function startSelecting(key,inWizard=false){
    stopSelecting(!inWizard);
    selecting=key;
    $('#selecttext').textContent=inWizard?`Passo ${wizardIndex+1} de ${order.length}: clique no campo ${names[key]}`:'Clique no campo: '+names[key];
    $('#skip').hidden=!inWizard;selectionBanner.hidden=false;
    trackedDocs=bindings.documents(document);
    for(const doc of trackedDocs){doc.addEventListener('click',onPick,true);doc.addEventListener('keydown',onEscape,true);}
    if(!inWizard)show('Escolha o campo da página. Pressione Esc para cancelar.');
  }
  function stopSelecting(cancelWizard=false){
    selecting=null;selectionBanner.hidden=true;
    for(const doc of trackedDocs){doc.removeEventListener('click',onPick,true);doc.removeEventListener('keydown',onEscape,true);}
    trackedDocs=[];
    if(cancelWizard)wizard=false;
  }
  function onEscape(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();stopSelecting(true);}}
  function onPick(e){
    if(!selecting)return;
    if(e.composedPath().some(x=>x===host||x===shadow))return;
    const deepest=e.composedPath().find(node=>node&&node.nodeType===1&&node!==host)||e.target;
    const el=sourceElement(deepest);
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    if(!selectable(el,selecting)){show('Selecione um campo de texto ou valor válido.');return;}
    const key=selecting;
    try{
      const desc=bindings.describe(el,document);
      // Não aceite o mesmo campo como origem e destino para evitar inserção circular.
      if(key==='relato'&&order.slice(0,-1).some(k=>JSON.stringify(cfg.fields[k])===JSON.stringify(desc))){
        show('Esse campo já é origem de dados. Escolha outro campo principal.');return;
      }
      if(key!=='relato'&&JSON.stringify(cfg.fields.relato)===JSON.stringify(desc)){
        show('O campo principal não pode ser usado como origem.');return;
      }
      cfg.fields[key]=desc;
      if(wizard){advanceWizard();}else stopSelecting();
      render();persist();scheduleMapsSync(true);scheduleLookup();
      if(!wizard)show(names[key]+' vinculado.');
    }catch(err){show(err.message||'Não foi possível vincular o campo.');}
  }
  async function persist(){
    try{await bindings.remote('save',JSON.parse(JSON.stringify(cfg)));render();}
    catch(err){show('Falha ao salvar os vínculos: '+err.message);}
  }
  function removeField(key){delete cfg.fields[key];delete sadeBindings[key];render();persist();scheduleMapsSync(true);scheduleLookup();show(names[key]+' desvinculado.');}
  function boundElement(key){
    if(cfg.fields[key])return bindings.resolve(cfg.fields[key],document);
    // Fallback: tentar resolver pela descrição do adaptador SADE (não salva ainda)
    if(sadeBindings[key])return bindings.resolve(sadeBindings[key],document);
    return null;
  }
  function findFieldElement(key){
    const exact=automaticFieldElement(key);
    if(exact)return exact;
    const el=boundElement(key);
    if(el)return el;
    const selectors={
      cidade:['#municipio','input[id*="municipio" i]','input[name*="municipio" i]','#cidade','input[id*="cidade" i]','input[name*="cidade" i]','[data-field="municipio"]'],
      rua:['#logradouro','input[id*="logradouro" i]','input[name*="logradouro" i]','input[id*="endereco" i]','input[name*="endereco" i]','#rua','[data-field="logradouro"]'],
      bairro:['#bairro','input[id*="bairro" i]','input[name*="bairro" i]','[data-field="bairro"]'],
      numero:['#numero','input[id*="numero" i]','input[name*="numero" i]','input[id*="imovel" i]','input[name*="imovel" i]']
    };
    const list=selectors[key]||[];
    for(const doc of bindings.documents(document)){
      for(const sel of list){
        try{
          const found=doc.querySelector(sel);
          if(found&&bindings.addressField(found))return found;
        }catch(_){}
      }
    }
    return null;
  }
  function automaticFieldElement(key){
    const selector=automaticSelectors[key];
    if(!selector)return null;
    const matches=[];
    for(const doc of bindings.documents(document)){
      try{
        for(const target of doc.querySelectorAll(selector)){
          const controls=[...target.querySelectorAll('input,textarea,select,[contenteditable="true"],[contenteditable="plaintext-only"]')];
          matches.push(controls.length===1?bindings.control(controls[0]):bindings.control(target));
        }
      }catch(_){}
    }
    return matches.length===1?matches[0]:null;
  }
  const automaticSelectors={
    nome:'#NOME',
    telefone:'#TELEFONE',
    cidade:'#municipio_endereco',
    rua:'#pesquisa_endereco',
    numero:'#_ID_DIV',
    bairro:'#pesquisa_bairro',
    complemento:'#topo_mapa > div:nth-child(7) > div',
    relato:'#collapseFive > div > div:nth-child(1) > div'
  };
  function autoBindFields(){
    let changed=false;
    for(const key of Object.keys(automaticSelectors)){
      const el=findFieldElement(key);
      if(!el)continue;
      try{
        const description=bindings.describe(el,document);
        if(JSON.stringify(cfg.fields[key])!==JSON.stringify(description)){
          cfg.fields[key]=description;changed=true;
        }
      }catch(_){}
    }
    return changed;
  }
  function handleFieldSuggestion(key,target){
    if(!target||!addressPopup)return;
    const val=String(target.value||'').trim();

    if(key==='cidade'){
      if(val.length<3){
        if(addressPopup.visible&&addressPopup.targetEl===target)addressPopup.hide();
        return;
      }
      const municipios=municipalityNames();
      const cityMatches=matcher.rank(val,municipios,3).filter(x=>x.score>=60&&matcher.norm(x.name)!==matcher.norm(val));
      if(cityMatches.length>0){
        addressPopup.show(target,cityMatches.map(item=>({
          name:item.name,
          title:item.name,
          subtitle:'Município parecido · confira antes de usar',
          type:'city',
          score:item.score
        })),{
          title:'Sugestão de Município',
          source:'IBGE / SADE',
          onSelect:(item)=>{
            try{setText(target,item.name);}catch(_){}
            applySuggestion({cidade:item.name});
          },
          onUndo:(prevVal)=>{
            try{setText(target,prevVal);}catch(_){}
            applySuggestion({cidade:prevVal});
          }
        });
      }else{
        if(addressPopup.visible&&addressPopup.targetEl===target)addressPopup.hide();
      }
    }else if(key==='rua'){
      if(val.length<3){
        if(addressPopup.visible&&addressPopup.targetEl===target)addressPopup.hide();
        return;
      }
      if(hereService){
        const cidadeVal=read('cidade')||'';
        const bairroVal=read('bairro')||'';
        hereService.autosuggest(val,{city:cidadeVal,cidade:cidadeVal,district:bairroVal,bairro:bairroVal,limit:5})
          .then(res=>{
            const rawItems=Array.isArray(res)?res:(res?.items||[]);
            if(!rawItems.length){
              if(addressPopup.visible&&addressPopup.targetEl===target)addressPopup.hide();
              return;
            }
            const suggestions=rawItems.map(item=>({
              title:item.street||item.title||item.name,
              street:item.street||item.title||item.name,
              district:item.district||'',
              city:item.city||cidadeVal,
              state:item.state||'PR',
              postalCode:item.postalCode||'',
              divergentCity:item.divergentCity||null,
              districtDivergence:item.districtDivergence||false,
              matchType:item.matchType||'fuzzy',
              source:item.source||(res.mock?'HERE (Simulador)':'HERE Technologies')
            }));
            const primarySource=suggestions[0]?.source||(res.mock?'HERE (Simulador)':'HERE Technologies');
            addressPopup.show(target,suggestions,{
              title:'Sugestão de Logradouro',
              source:primarySource,
              onSelect:(item)=>{
                try{setText(target,item.street);}catch(_){}
                const updates={rua:item.street};
                if(item.district&&(!bairroVal||item.districtDivergence)){
                  updates.bairro=item.district;
                }
                if(item.postalCode&&!read('cep')){
                  updates.cep=item.postalCode;
                }
                if(item.city&&item.divergentCity){
                  updates.cidade=item.city;
                }
                applySuggestion(updates);
              },
              onUndo:(prevVal)=>{
                try{setText(target,prevVal);}catch(_){}
                applySuggestion({rua:prevVal});
              }
            });
          })
          .catch(()=>{
            if(addressPopup.visible&&addressPopup.targetEl===target)addressPopup.hide();
          });
      }
    }else if(key==='bairro'){
      const ruaVal=read('rua');
      const cidadeVal=read('cidade');
      if(val.length>=3&&ruaVal&&hereService){
        hereService.autosuggest(ruaVal,{city:cidadeVal,cidade:cidadeVal,district:val,bairro:val,limit:3})
          .then(res=>{
            const best=(Array.isArray(res)?res[0]:res?.items?.[0]);
            if(best&&best.district&&matcher.score(val,best.district)<70&&matcher.norm(val)!==matcher.norm(best.district)){
              addressPopup.show(target,[{
                title:best.district,
                street:best.street,
                district:best.district,
                city:best.city,
                subtitle:`Bairro cadastrado para "${best.street||ruaVal}"`,
                districtDivergence:true
              }],{
                title:'Divergência de Bairro',
                source:best.source||(res.mock?'HERE (Simulador)':'HERE Technologies'),
                onSelect:(item)=>{
                  try{setText(target,item.district);}catch(_){}
                  applySuggestion({bairro:item.district});
                },
                onUndo:(prevVal)=>{
                  try{setText(target,prevVal);}catch(_){}
                  applySuggestion({bairro:prevVal});
                }
              });
            }else if(addressPopup.visible&&addressPopup.targetEl===target){
              addressPopup.hide();
            }
          })
          .catch(()=>{});
      }
    }
  }
  function onFieldInput(e){
    if(cfg.hereEnabled===false)return;
    const target=e.target;
    if(!target||!target.tagName||!['INPUT','TEXTAREA'].includes(target.tagName))return;
    if(target.closest&&target.closest('.panel, .relato-address-popup, .toolbar'))return;

    let matchedKey=null;
    for(const key of ['cidade','rua','bairro']){
      if(boundElement(key)===target||findFieldElement(key)===target){
        matchedKey=key;
        break;
      }
    }

    if(!matchedKey){
      const id=String(target.id||'').toLowerCase();
      const name=String(target.name||'').toLowerCase();
      if(id.includes('municipio')||name.includes('municipio')||id.includes('cidade')||name.includes('cidade'))matchedKey='cidade';
      else if(id.includes('logradouro')||name.includes('logradouro')||id.includes('endereco')||name.includes('endereco'))matchedKey='rua';
      else if(id.includes('bairro')||name.includes('bairro'))matchedKey='bairro';
    }

    if(!matchedKey)return;

    clearTimeout(fieldInputTimer);
    fieldInputTimer=setTimeout(()=>{
      handleFieldSuggestion(matchedKey,target);
    },matchedKey==='cidade'?300:450);
  }
  function render(){
    for(const key of [...order,'cep']){
      const row=panel.querySelector(`[data-key="${key}"]`);const status=row.querySelector('.state');
      const btn=row.querySelector('.link'),clear=row.querySelector('.clear');
      const has=!!cfg.fields[key],found=!!(findFieldElement(key)||has&&boundElement(key));
      // Determinar fonte do vínculo para o indicador visual
      const sadeInfo=sadeState?.fields?.[key];
      const isAutoSade=has&&sadeBindings[key]&&sadeInfo?.mode==='auto';
      const isConfirmSade=sadeInfo?.mode==='confirm'||sadeInfo?.mode==='conflict';
      let statusText=has?(found?'Vinculado':'Vínculo não encontrado'):'Não vinculado';
      if(isAutoSade&&found)statusText='Automático (SADE)';
      else if(isConfirmSade)statusText='Aguarda confirmação';
      status.textContent=statusText;
      status.className='state'+(found?' ok':has?' missing':isConfirmSade?' missing':'');
      btn.textContent=has?'Alterar':'Vincular';btn.hidden=found;clear.style.visibility=has&&!found?'visible':'hidden';
    }
    $('#wizard').hidden=order.every(key=>!!findFieldElement(key));
    $('#sep').value=cfg.separator==='|'?'|':'-';
    $('#profileAuto').checked=cfg.profileAuto!==false;
    if($('#hereEnabled'))$('#hereEnabled').checked=cfg.hereEnabled!==false;
    if($('#hereUseMock'))$('#hereUseMock').checked=cfg.hereUseMock!==false;
    if($('#hereApiKey'))$('#hereApiKey').value=cfg.hereApiKey||'';
    updateToolbar();
    renderSadeSettings();
  }
  $('#sep').addEventListener('change',e=>{cfg.separator=e.target.value==='|'?'|':'-';persist();});
  function getAddress(){const address=Object.fromEntries(['cidade','rua','numero','bairro'].map(key=>[key,read(key)]));const manual=matcher.cep($('#manualCep').value);address.cep=manual||read('cep');return address;}
  function mapsStamp(){const a=getAddress();return JSON.stringify([a.cidade,a.rua,a.numero,a.bairro]);}
  function mapsStatus(message,connected=false){
    $('#mapsStatus').textContent=message;
    $('#mapsStatus').dataset.connected=connected?'1':'0';
    $('#mapsNow').disabled=!connected;
    $('#mapsPause').disabled=!connected;
  }
  async function mapsMessage(type,extra={}){
    const response=await chrome.runtime.sendMessage({type,...extra});
    if(!response?.ok)throw Error(response?.error||'Não foi possível conectar com o Google Maps.');
    return response;
  }
  async function openMaps(){
    try{
      const result=await mapsMessage('RELATO_MAPS_OPEN',{address:getAddress()});
      mapsManualPause=false;mapsHoldStamp='';mapsActive=true;mapsLastStamp=mapsStamp();mapsObservedStamp=mapsLastStamp;
      $('#mapsPause').textContent='Pausar atualização';
      mapsStatus(result.opened?'Google Maps aberto com a pesquisa atual.':'Aba Google Maps aberta. Preencha município e rua para pesquisar.',true);
      show('Aba Google Maps aberta. Volte ao atendimento para continuar preenchendo.');
    }catch(err){mapsStatus(err.message);show(err.message);}
  }
  function scheduleMapsSync(immediate=false){
    if(!mapsActive)return;
    const stamp=mapsStamp();
    if(!immediate && stamp===mapsPendingStamp)return;
    mapsObservedStamp=stamp;mapsPendingStamp=stamp;
    clearTimeout(mapsTimer);
    mapsTimer=setTimeout(()=>{mapsPendingStamp='';syncMaps(false);},immediate?100:1800);
  }
  async function syncMaps(force=false){
    if(mapsBusy||(!force&&!mapsActive))return;
    const address=getAddress(),stamp=mapsStamp();
    if(!force&&stamp===mapsLastStamp)return;
    if(force)mapsHoldStamp='';
    mapsBusy=true;
    try{
      const result=await mapsMessage('RELATO_MAPS_SYNC',{address,force});
      if(!result.connected){mapsActive=false;mapsStatus(result.reason||'Aba do Maps fechada.');return;}
      if(result.retryAfterMs){mapsTimer=setTimeout(()=>syncMaps(false),Math.min(result.retryAfterMs,5000));return;}
      mapsLastStamp=stamp;
      if(result.updated){mapsStatus('Pesquisa atualizada na aba Google Maps. Confirme o resultado e o número do imóvel.',true);}
      else if(result.reset){mapsStatus('Endereço anterior limpo no Maps. Preencha município e rua para uma nova pesquisa.',true);}
      else if(force){mapsStatus(result.reason||'Pesquisa já está atualizada.',true);}
    }catch(err){mapsStatus('Falha ao atualizar: '+err.message,true);}
    finally{mapsBusy=false;}
  }
  function lookupStamp(){const a=getAddress();return JSON.stringify([a.cidade,a.rua,a.bairro,matcher.cep(a.cep)]);}
  // Stamp parcial: cidade+rua+CEP (sem bairro) — lookup permanece válido enquanto o bairro é editado
  function lookupStampPartial(){const a=getAddress();return JSON.stringify([a.cidade,a.rua,matcher.cep(a.cep)]);}
  function stampToPartial(s){try{const p=JSON.parse(s);return JSON.stringify([p[0],p[1],p[3]]);}catch(_){return ''}}
  function scheduleLookup(){
    showSuggestions();if(!lookupAllowed)return;
    const a=getAddress(),hasCep=matcher.cep(a.cep).length===8;
    if(!hasCep&&(a.cidade.length<3||a.rua.length<4))return;
    const stamp=lookupStamp();if(stamp===lastLookupSignature||stamp===lookupScheduledStamp)return;
    clearTimeout(lookupTimer);lookupScheduledStamp=stamp;
    // CEP completo tem prioridade; cada consulta é acionada somente após pausa na digitação.
    const delay=Math.max(hasCep?700:1700,2500-(Date.now()-lastLookupTime));
    lookupTimer=setTimeout(()=>{lookupScheduledStamp='';verifyAddress(true);},delay);
  }
  async function verifyAddress(automatic=false){
    if(!lookupAllowed||lookupBusy)return;
    clearTimeout(lookupTimer);lookupTimer=null;lookupScheduledStamp='';
    const a=getAddress(),stamp=lookupStamp();
    if(automatic&&stamp===lastLookupSignature)return;
    if(automatic&&matcher.cep(a.cep).length!==8&&(!a.cidade||a.rua.length<4))return;
    lookupBusy=true;lastLookupTime=Date.now();lastLookupSignature=stamp;
    $('#verifyAddress').disabled=true;$('#lookupStatus').textContent='Consultando referências públicas…';
    try{
      const r=await mapsMessage('RELATO_LOOKUP_ADDRESS',{address:a,consent:true});
      recentLookup={stamp,results:r};
      const cepList=r.cep?.data||[];
      const withCoords=cepList.find(x=>x.coordinates&&matcher.differences(a,x).length===0);
      cepCoordinates=withCoords?.coordinates||null;cepCoordinatesFor=cepCoordinates?stamp:'';
      const diffs=cepList.flatMap(x=>matcher.differences(a,x));
      renderCepResult();
      const info=(r.providers||[]).join(', ')||'Nenhuma fonte disponível';
      $('#lookupStatus').textContent=cepList.length?`CEP encontrado em ${[...new Set(cepList.map(x=>x.source))].join(' e ')}. Confira o endereço destacado acima e confirme qualquer alteração. O número do imóvel NÃO foi verificado.`:`Fontes: ${info}. ${r.vias?.length||0} opções de logradouro. ${diffs.length?diffs.length+' possível(is) divergência(s) — confira abaixo.':'Não confirma número do imóvel.'}${r.errors?.length?' Algumas fontes não responderam.':''}`;
      $('#assistFlag').textContent=cepList.length?'CEP consultado':diffs.length?'Conferir divergências':r.vias?.length?'Sugestões disponíveis':'Consulta concluída';
      showSuggestions();
    }catch(err){$('#cepResult').hidden=true;$('#lookupStatus').textContent='Não foi possível consultar: '+err.message;}
    finally{lookupBusy=false;$('#verifyAddress').disabled=!lookupAllowed;}
  }
  function renderCepResult(){
    const card=$('#cepResult');card.replaceChildren();card.hidden=true;
    if(!recentLookup||recentLookup.stamp!==lookupStamp())return;
    const r=recentLookup.results,records=r.cep?.data||[];
    const providedCep=matcher.cep(getAddress().cep);
    if(providedCep.length!==8)return;
    const make=(tag,cls,value)=>{const node=document.createElement(tag);node.className=cls;node.textContent=value;card.append(node);return node;};
    if(!records.length){
      make('div','cepResultTitle','CEP não localizado nas fontes consultadas');
      make('p','cepResultMeta','Confira os oito dígitos. As fontes podem estar indisponíveis ou não possuir esse cadastro.');
      card.hidden=false;return;
    }
    // Fontes iguais aparecem em um único resumo, sem repetir o endereço inteiro.
    const best=[...records].sort((a,b)=>[a.rua,a.bairro,a.cidade].filter(Boolean).length-[b.rua,b.bairro,b.cidade].filter(Boolean).length).at(-1);
    make('div','cepResultTitle','CEP encontrado: '+providedCep.slice(0,5)+'-'+providedCep.slice(5));
    make('div','cepResultLine','Logradouro: '+(best.rua||'não informado pela fonte'));
    make('div','cepResultLine','Bairro: '+(best.bairro||'não informado pela fonte'));
    make('div','cepResultLine','Município/UF: '+([best.cidade,best.uf].filter(Boolean).join(' / ')||'não informado'));
    make('div','cepResultMeta','Fontes: '+[...new Set(records.map(x=>x.source))].join(', ')+'. O CEP não confirma o número do imóvel.');
    const current=getAddress();const differences=matcher.differences(current,best);
    if(differences.length){
      make('div','cepResultWarning','Confira divergências: '+differences.map(x=>x.label+' (digitado: '+x.digitado+'; fonte: '+x.referencia+')').join(' · '));
    }
    const alternatives=records.some(x=>['rua','bairro','cidade'].some(k=>matcher.norm(x[k])!==matcher.norm(best[k])));
    if(alternatives)make('div','cepResultWarning','As fontes forneceram dados diferentes. Compare os resultados antes de aplicar.');
    const values={cidade:best.cidade,rua:best.rua,bairro:best.bairro};
    if(Object.values(values).some(Boolean)){
      const btn=make('button','cepResultButton','Aplicar dados do CEP aos campos vinculados');
      btn.type='button';btn.addEventListener('click',()=>applySuggestion(values));
    }
    card.hidden=false;
  }
  function showSuggestions(){
    renderCepResult();
    const holder=$('#lookupSuggestions');holder.replaceChildren();
    const a=getAddress(),municipios=municipalityNames();
    const cityMatches=matcher.rank(a.cidade,municipios,3).filter(x=>x.score>=60&&matcher.norm(x.name)!==matcher.norm(a.cidade));
    // Configuração v5.8.0 solicitada: a indicação de município parecido aparece em POPUP NA TELA e NÃO na extensão!
    if(cityMatches.length>0&&addressPopup){
      const cidadeEl=findFieldElement('cidade');
      addressPopup.show(cidadeEl,cityMatches.map(item=>({
        name:item.name,
        title:item.name,
        subtitle:'Município parecido · confira antes de usar',
        type:'city',
        score:item.score
      })),{
        title:'Sugestão de Município',
        source:'IBGE / SADE',
        onSelect:(item)=>{
          applySuggestion({cidade:item.name});
        },
        onUndo:(prevVal)=>{
          applySuggestion({cidade:prevVal});
        }
      });
    }else if(addressPopup&&addressPopup.visible&&addressPopup.targetEl===findFieldElement('cidade')){
      addressPopup.hide();
    }
    // Usa stamp parcial (cidade+rua+CEP, sem bairro) para manter o lookup válido enquanto o bairro é editado
    if(!recentLookup||stampToPartial(recentLookup.stamp)!==lookupStampPartial())return;
    const r=recentLookup.results;
    const allVias=r.vias||[];
    const vias=allVias.filter(x=>matcher.score(a.rua,x.rua)>=30).slice(0,5);
    for(const v of vias)addSuggestion(v.rua,`ViaCEP · ${v.cidade||a.cidade} · ${v.bairro||'bairro não informado'} · CEP ${v.cep||'não informado'}`,()=>applySuggestion({rua:v.rua,bairro:v.bairro||'',cidade:v.cidade||a.cidade}));
    // Aviso de rua: nenhuma via encontrada pelo ViaCEP, ou encontradas mas nenhuma parecida com o digitado
    if(a.rua.length>=4&&vias.length===0){
      if(allVias.length===0){
        // ViaCEP não retornou nenhuma rua para essa cidade — pode ser grafia totalmente errada
        addWarning('⚠ Rua não localizada no ViaCEP','Nenhuma rua foi encontrada para "'+a.rua+'" em '+a.cidade+'. Verifique se a cidade está correta e se o nome da rua está sem abreviações ou erros de digitação.');
      }else{
        // ViaCEP retornou ruas, mas nenhuma é parecida com o digitado
        const best=allVias.map(x=>({rua:x.rua,score:matcher.score(a.rua,x.rua)})).sort((a,b)=>b.score-a.score)[0];
        addWarning('⚠ Rua possivelmente errada','Nenhum logradouro parecido com "'+a.rua+'" foi localizado. Confira a grafia.'+(best&&best.score>=20?' Mais próximo encontrado: '+best.rua:''));
      }
    }
    // Divergência de bairro: quando a via mais parecida existe, mas o bairro digitado difere
    if(a.bairro.length>=3&&vias.length>0){
      const bestVia=vias[0];
      if(bestVia.bairro){
        const bairroScore=matcher.score(a.bairro,bestVia.bairro);
        if(bairroScore<70&&matcher.norm(a.bairro)!==matcher.norm(bestVia.bairro)){
          addSuggestion(bestVia.bairro,`Bairro sugerido para "${bestVia.rua}" · ViaCEP · confira antes de usar`,()=>applySuggestion({bairro:bestVia.bairro}));
        }
      }
    }
    const cepRecords=r.cep?.data||[];
    if(cepRecords.length>1){
      const primary=cepRecords[0];
      for(const alternative of cepRecords.slice(1)){
        if(['cidade','rua','bairro'].every(k=>matcher.norm(primary[k])===matcher.norm(alternative[k])))continue;
        const fields={cidade:alternative.cidade,rua:alternative.rua,bairro:alternative.bairro};
        addSuggestion('Alternativa de '+alternative.source+': '+(alternative.rua||'sem logradouro'),
          `${alternative.bairro||'Sem bairro'} · ${alternative.cidade||'Sem município'} · confira as fontes antes de alterar`,
          ()=>applySuggestion(fields));
      }
    }
    if(!holder.children.length){const label=document.createElement('div');label.className='assistInfo';label.textContent='Sem sugestões para os campos atuais. O endereço pode ser válido mesmo sem cadastro nas fontes consultadas.';holder.append(label);}
  }
  function addSuggestion(label,detail,action){
    const el=document.createElement('div');el.className='suggestion';
    const box=document.createElement('div'),title=document.createElement('strong'),caption=document.createElement('small');
    title.textContent=label;caption.textContent=detail;box.append(title,caption);
    const btn=document.createElement('button');btn.textContent='Usar';btn.title='Aplicar somente após conferir';btn.addEventListener('click',action);
    el.append(box,btn);$('#lookupSuggestions').append(el);
  }
  function addWarning(label,detail){
    const el=document.createElement('div');el.className='suggestion';el.style.cssText='background:#fff8e9;border-color:#f0dfb8';
    const box=document.createElement('div'),title=document.createElement('strong'),caption=document.createElement('small');
    title.textContent=label;title.style.color='#8a5c0e';caption.textContent=detail;caption.style.color='#7a5320';box.append(title,caption);
    el.append(box);$('#lookupSuggestions').append(el);
  }
  function applySuggestion(values){
    let updated=0,missing=[];
    for(const [key,value] of Object.entries(values)){
      if(!value)continue;
      const el=boundElement(key)||findFieldElement(key);
      if(!el){missing.push(names[key]||key);continue;}
      if(el.disabled||el.readOnly){missing.push(names[key]||key);continue;}
      try{setText(el,value);updated++;}catch(_){missing.push(names[key]||key);}
    }
    show(updated?`${updated} campo(s) atualizado(s) após sua confirmação.${missing.length?' Campos não modificados: '+missing.join(', '):''}`:'Nenhum campo foi atualizado. Confira seus vínculos.');
    scheduleMapsSync(true);
  }
  async function openStreetView(){
    try{
      // Restaura a abertura direta da 5.6.1. O ponto pode ser aproximado.
      // Acompanhará AUTOMATICAMENTE o próximo endereço, sem fechar a panorâmica atual.
      const stamp=mapsStamp();
      const coordinates=lookupStamp()===cepCoordinatesFor?cepCoordinates||undefined:undefined;
      const result=await mapsMessage('RELATO_MAPS_STREETVIEW',{address:getAddress(),coordinates});
      clearTimeout(mapsTimer);mapsTimer=null;mapsPendingStamp='';
      mapsActive=!mapsManualPause;
      mapsLastStamp=stamp;mapsObservedStamp=stamp;
      mapsHoldStamp=result.panorama?stamp:'';
      $('#mapsPause').textContent=mapsActive?'Pausar atualização':'Retomar atualização';
      const reason=result.panorama?
        result.reason+(mapsActive?' A pesquisa automática continuará quando você mudar o endereço.':' A atualização permanece pausada até você retomar.'):
        result.reason+(mapsActive?' A atualização automática permanece disponível.':' A atualização está pausada até você retomar.');
      mapsStatus(reason,true);show(reason);
    }catch(err){show(err.message);}
  }
  function matchingProfile(profile){
    if(!profile?.fields?.relato)return null;
    let found=0,total=0;
    for(const [key,desc] of Object.entries(profile.fields)){
      if(!desc)continue;total++;
      if(bindings.resolve(desc,document))found++;
    }
    return bindings.resolve(profile.fields.relato,document)&&found>=3&&found/Math.max(1,total)>=.85?{found,total}:null;
  }
  async function loadProfiles(){
    try{
      storedProfiles=await bindings.remote('profiles.list')||[];
      const select=$('#profileList');select.replaceChildren();
      const empty=document.createElement('option');empty.value='';empty.textContent=storedProfiles.length?'Selecione um perfil':'Nenhum perfil salvo';select.append(empty);
      for(const p of storedProfiles){const opt=document.createElement('option');opt.value=p.id;opt.textContent=p.name;select.append(opt);}
      if(cfg.profileAuto!==false&&(!cfg.fields.relato||!boundElement('relato'))){
        const matches=storedProfiles.map(p=>({profile:p,valid:matchingProfile(p)})).filter(x=>x.valid);
        matches.sort((a,b)=>b.valid.found-a.valid.found);
        if(matches.length&&(matches.length===1||matches[0].valid.found>matches[1].valid.found)){
          cfg.fields={...matches[0].profile.fields};render();await persist();
          $('#profileStatus').textContent='Perfil identificado: '+matches[0].profile.name;
        }
      }
    }catch(err){$('#profileStatus').textContent='Não foi possível carregar perfis: '+err.message;}
  }
  async function saveProfile(){
    const name=$('#profileName').value.trim();if(!name){show('Digite um nome para o perfil.');return;}
    if(!cfg.fields.relato){show('Vincule o campo principal antes de salvar um perfil.');return;}
    try{await bindings.remote('profiles.save',cfg,{name});$('#profileName').value='';await loadProfiles();show('Perfil salvo. Apenas vínculos foram armazenados.');}
    catch(err){show('Falha ao salvar perfil: '+err.message);}
  }
  async function applySelectedProfile(){
    const p=storedProfiles.find(x=>x.id===$('#profileList').value);
    if(!p){show('Escolha um perfil salvo.');return;}
    if(!matchingProfile(p)){show('Este perfil não corresponde com segurança aos campos da página. Vincule os campos manualmente.');return;}
    cfg.fields={...p.fields};render();await persist();show('Perfil aplicado: '+p.name);
  }
  async function deleteProfile(){
    const p=storedProfiles.find(x=>x.id===$('#profileList').value);
    if(!p){show('Escolha um perfil para excluir.');return;}
    try{await bindings.remote('profiles.delete',undefined,{id:p.id});await loadProfiles();show('Perfil excluído. Os vínculos atuais continuam ativos.');}
    catch(err){show('Não foi possível excluir o perfil: '+err.message);}
  }
  document.addEventListener('input',()=>{scheduleMapsSync();scheduleLookup();},true);
  document.addEventListener('change',()=>{scheduleMapsSync();setTimeout(scheduleLookup,150);},true);
  function read(key){
    const el=boundElement(key)||findFieldElement(key);
    return el ? bindings.valueOf(el) : '';
  }
  function normalize(value){return String(value||'').replace(/\s+/g,' ').trim().toLocaleUpperCase('pt-BR');}
  function hasText(el){return el&&bindings.addressField(el);}
  function setText(el,value){
    const doc=el.ownerDocument;const win=doc.defaultView||window;
    if(el.tagName==='SELECT'){
      const wanted=matcher.norm(value),option=[...el.options].find(o=>matcher.norm(o.textContent)===wanted||matcher.norm(o.value)===wanted);
      if(!option)throw Error('Valor sugerido não está disponível na lista do sistema.');
      el.value=option.value;el.dispatchEvent(new win.Event('input',{bubbles:true}));el.dispatchEvent(new win.Event('change',{bubbles:true}));
    }else if(el.tagName==='TEXTAREA'||el.tagName==='INPUT'){
      const proto=el.tagName==='TEXTAREA'?win.HTMLTextAreaElement.prototype:win.HTMLInputElement.prototype;
      const setter=Object.getOwnPropertyDescriptor(proto,'value')?.set;
      if(setter)setter.call(el,value);else el.value=value;
      el.dispatchEvent(new win.Event('input',{bubbles:true}));
      el.dispatchEvent(new win.Event('change',{bubbles:true}));
    }else if(el.isContentEditable){
      el.textContent=value;
      el.dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'insertText',data:value}));
    }else throw Error('O campo de destino não aceita texto.');
  }
  async function toClipboard(text){
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return;}}
    catch(_){}
    // Alternativa para páginas HTTP que não têm Clipboard API.
    const tmp=document.createElement('textarea');tmp.value=text;tmp.style.cssText='position:fixed;left:-99999px;top:-99999px';
    document.body.append(tmp);tmp.select();const ok=document.execCommand('copy');tmp.remove();
    if(!ok)throw Error('Não foi possível copiar automaticamente. Confira a permissão de área de transferência.');
  }
  function previousBase(target,current){
    const previous=inserted.get(target);
    if(!previous)return current;
    if(current===previous.prefix)return '';
    const token=previous.prefix+' '+previous.sep+' ';
    if(current.startsWith(token))return current.slice(token.length);
    return current;
  }
  async function execute(){
    if(busy)return;
    const target=boundElement('relato');
    if(!hasText(target)){toggle(true);showSettings(true);show('Primeiro vincule o campo de texto principal.');return;}
    if(target.disabled||target.readOnly){show('O campo de texto está bloqueado para edição.');return;}
    const addressKeys=order.filter(k=>k!=='relato');
    const parts=addressKeys.map(read).map(normalize).filter(Boolean);
    if(!parts.length&&!read('relato')){show('Ainda não há dados para copiar.');return;}
    const sep=cfg.separator==='|'?'|':'-';
    const old=String(target.isContentEditable?(target.innerText||''):target.value||'');
    const base=normalize(previousBase(target,old.trim()));
    const prefix=parts.join(' '+sep+' ');
    const joined=[prefix,base].filter(Boolean).join(' '+sep+' ');
    if(!joined){show('Nada para copiar.');return;}
    busy=true;$('#execute').disabled=true;$('#quick').disabled=true;
    try{
      setText(target,joined);
      // Registro somente em memória, usado para evitar cabeçalhos duplicados.
      inserted.set(target,{prefix,sep});
      try{await toClipboard(joined);show('Dados inseridos e copiados.');}
      catch(err){show('Dados inseridos, mas a cópia falhou: '+err.message);}
    }catch(err){show('Não foi possível preencher o campo principal: '+err.message);}
    finally{busy=false;$('#execute').disabled=false;$('#quick').disabled=false;}
  }
  function viewRect(el){
    const rect=el.getBoundingClientRect();let l=rect.left,t=rect.top;
    try{let w=el.ownerDocument.defaultView;while(w!==window){const fr=w.frameElement;if(!fr)break;const frRect=fr.getBoundingClientRect();l+=frRect.left;t+=frRect.top;w=fr.ownerDocument.defaultView;}}
    catch(_){return null;}
    return {left:l,top:t,width:rect.width,height:rect.height};
  }
  // A posição livre pertence apenas às preferências deste site, não aos valores da ocorrência.
  function clampToolbarPosition(x,y){
    const width=Math.max(100,toolbar.offsetWidth||320),height=Math.max(32,toolbar.offsetHeight||48);
    return {x:Math.max(8,Math.min(innerWidth-width-8,x)),y:Math.max(8,Math.min(innerHeight-height-8,y))};
  }
  function toolbarFreePosition(){
    const position=cfg.toolbarPosition;
    if(!position||!Number.isFinite(position.x)||!Number.isFinite(position.y))return null;
    const width=Math.max(100,toolbar.offsetWidth||320),height=Math.max(32,toolbar.offsetHeight||48);
    return clampToolbarPosition(8+position.x*Math.max(0,innerWidth-width-16),8+position.y*Math.max(0,innerHeight-height-16));
  }
  function applyToolbarPosition(x,y){
    const p=clampToolbarPosition(x,y);
    toolbar.style.left=Math.round(p.x)+'px';toolbar.style.top=Math.round(p.y)+'px';
    return p;
  }
  function updateToolbar(){
    if(!mounted)return;
    const el=boundElement('relato');
    if(!el){toolbar.hidden=true;return;}
    if(cfg.toolbarMode==='free'){
      toolbar.hidden=false;toolbar.classList.add('isFree');
      const p=toolbarFreePosition();if(p)applyToolbarPosition(p.x,p.y);
      else{cfg.toolbarMode='follow';updateToolbar();}
      return;
    }
    toolbar.classList.remove('isFree');
    const r=viewRect(el);
    if(!r||r.width<25||r.height<5||r.top+r.height<0||r.top>innerHeight){toolbar.hidden=true;return;}
    toolbar.hidden=false;
    const width=toolbar.offsetWidth||320;
    const left=Math.max(8,Math.min(r.left,innerWidth-width-8));
    const top=r.top+r.height+7;
    applyToolbarPosition(left,Math.min(innerHeight-(toolbar.offsetHeight||48)-8,Math.max(8,top)));
  }
  function resetToolbar(){
    cfg.toolbarMode='follow';delete cfg.toolbarPosition;
    updateToolbar();persist();show('Barra reencaixada abaixo do campo principal.');
  }
  function installToolbarDrag(){
    const handle=$('#moveToolbar');let drag=null;
    handle.addEventListener('pointerdown',e=>{
      if(e.button!==0||!boundElement('relato'))return;
      e.preventDefault();e.stopPropagation();
      const rect=toolbar.getBoundingClientRect();
      drag={id:e.pointerId,dx:e.clientX-rect.left,dy:e.clientY-rect.top};
      cfg.toolbarMode='free';toolbar.classList.add('isFree','dragging');
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove',e=>{
      if(!drag||e.pointerId!==drag.id)return;
      e.preventDefault();
      const p=applyToolbarPosition(e.clientX-drag.dx,e.clientY-drag.dy);
      const availableX=Math.max(1,innerWidth-(toolbar.offsetWidth||320)-16);
      const availableY=Math.max(1,innerHeight-(toolbar.offsetHeight||48)-16);
      cfg.toolbarPosition={x:Math.min(1,Math.max(0,(p.x-8)/availableX)),y:Math.min(1,Math.max(0,(p.y-8)/availableY))};
    });
    const finish=e=>{
      if(!drag||e.pointerId!==drag.id)return;
      const wasDragged=!!cfg.toolbarPosition;
      drag=null;toolbar.classList.remove('dragging');
      if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);
      if(wasDragged){persist();show('Posição da barra salva. Use ↩ para reencaixar.');}
      else{cfg.toolbarMode='follow';updateToolbar();}
    };
    handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);
    // Teclado: setas movem a barra e Enter a reencaixa.
    handle.addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter'].includes(e.key))return;
      e.preventDefault();if(e.key==='Enter'){resetToolbar();return;}
      const r=toolbar.getBoundingClientRect(),step=e.shiftKey?40:12;
      const x=r.left+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0);
      const y=r.top+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0);
      const p=applyToolbarPosition(x,y);
      cfg.toolbarMode='free';toolbar.classList.add('isFree');
      cfg.toolbarPosition={x:Math.max(0,Math.min(1,(p.x-8)/Math.max(1,innerWidth-(toolbar.offsetWidth||320)-16))),y:Math.max(0,Math.min(1,(p.y-8)/Math.max(1,innerHeight-(toolbar.offsetHeight||48)-16)))};
      persist();
    });
  }
  let animationPending=false, frameScanPending=false, selectorScanPending=false;
  function scheduleToolbarUpdate(){
    if(animationPending)return;
    animationPending=true;
    requestAnimationFrame(()=>{animationPending=false;if(!selecting)updateToolbar();});
  }
  function monitor(doc){
    if(observed.has(doc))return;observed.add(doc);
    doc.addEventListener('scroll',scheduleToolbarUpdate,true);
    doc.addEventListener('scroll',()=>{if(addressPopup&&addressPopup.visible)addressPopup.reposition();},true);
    doc.defaultView?.addEventListener('resize',scheduleToolbarUpdate);
    doc.defaultView?.addEventListener('resize',()=>{if(addressPopup&&addressPopup.visible)addressPopup.reposition();});
    doc.addEventListener('input',onFieldInput,true);
    // Atualiza o botão somente uma vez por frame, mesmo em páginas reativas.
    const observer=new MutationObserver(records=>{
      scheduleToolbarUpdate();
      const elementAdded=records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1));
      if(elementAdded&&!selectorScanPending){
        selectorScanPending=true;
        setTimeout(()=>{
          selectorScanPending=false;
          if(autoBindFields()){render();persist();}
        },250);
      }
      if(frameScanPending)return;
      const frameAdded=records.some(record=>[...record.addedNodes].some(node=>
        node.nodeType===1&&(node.matches?.('iframe,frame')||node.querySelector?.('iframe,frame'))
      ));
      if(frameAdded){
        frameScanPending=true;
        setTimeout(()=>{frameScanPending=false;observeDocs();},300);
      }
    });
    observer.observe(doc.documentElement||doc,{childList:true,subtree:true});
  }
  function observeDocs(){for(const doc of bindings.documents(document))monitor(doc);}
  window.addEventListener('resize',()=>{updateToolbar();if(addressPopup&&addressPopup.visible)addressPopup.reposition();});
  window.addEventListener('scroll',()=>{updateToolbar();if(addressPopup&&addressPopup.visible)addressPopup.reposition();},true);
  document.addEventListener('input',onFieldInput,true);
  window.addEventListener('relato190:municipios-ready',()=>{
    const el=findFieldElement('cidade');
    if(el&&String(el.value||'').trim().length>=3)handleFieldSuggestion('cidade',el);
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&selecting)stopSelecting(true);},true);
  function checkAddressChanges(){
    if(mapsActive){
      const stamp=mapsStamp();
      if(stamp!==mapsObservedStamp){
        // Evita fechar uma panorâmica enquanto o endereço permanecer igual.
        mapsHoldStamp='';scheduleMapsSync();
      }
    }
    if(lookupAllowed&&lookupStamp()!==lastLookupSignature)scheduleLookup();
  }
  // ── Integração SADE ───────────────────────────────────────────────────────
  function sadeIconFor(status){
    return {idle:'',detecting:'🔍',waiting:'⏳',partial:'⚠',mapped:'✓',unavailable:'⚠',dismissed:''}[status]||'🔍';
  }
  function renderSadeStatusBar(){
    const bar=$('#sadeStatusBar'),txt=$('#sadeStatusText');
    if(!sadeState||sadeState.status==='idle'||sadeState.status==='dismissed'){bar.hidden=true;return;}
    bar.hidden=false;
    bar.dataset.sade=sadeState.status;
    txt.textContent=sadeState.message||'';
    const icon=bar.querySelector('.sadeIcon');
    if(icon)icon.textContent=sadeIconFor(sadeState.status);
  }
  function renderSadeSettings(){
    const box=$('#sadeSettingsBox'),titleEl=$('#sadeSettingsTitle'),msgEl=$('#sadeSettingsMsg'),list=$('#sadeFieldList');
    if(!sadeState||sadeState.status==='idle'){box.hidden=true;return;}
    box.hidden=false;
    const statusLabels={detecting:'Detectando…',waiting:'Aguardando formulário…',partial:'Parcialmente reconhecido',mapped:'Campos reconhecidos',unavailable:'Inacessível (outra origem)',dismissed:'Ignorado'};
    titleEl.textContent='SADE — '+(statusLabels[sadeState.status]||sadeState.status);
    msgEl.textContent=sadeState.message||'';
    list.replaceChildren();
    for(const key of [...order,'cep']){
      const info=sadeState.fields?.[key];
      if(!info)continue;
      const row=document.createElement('div');row.className='sadeFieldRow';
      const nameEl=document.createElement('span');nameEl.className='sadeFieldName';nameEl.textContent=names[key];
      const badge=document.createElement('span');badge.className='sadeFieldBadge';
      const modeLabel={auto:'Automático',confirm:'Confirmar',conflict:'Conflito',missing:'Não encontrado'};
      badge.textContent=modeLabel[info.mode]||info.mode;
      badge.className='sadeFieldBadge '+(info.mode==='auto'?'':''+info.mode);
      row.append(nameEl,badge);
      // Botão confirmar para campos 'confirm' e 'conflict' que têm elemento
      if((info.mode==='confirm')&&info.description){
        const btn=document.createElement('button');btn.className='sadeConfirmBtn';btn.textContent='Confirmar';
        btn.addEventListener('click',()=>confirmSadeField(key));
        row.append(btn);
      }else{const spacer=document.createElement('span');row.append(spacer);}
      list.append(row);
    }
  }
  function confirmSadeField(key){
    const info=sadeState?.fields?.[key];
    if(!info?.description)return;
    // Aplicar descrição ao cfg.fields e salvar
    try{
      cfg.fields[key]=info.description;
      sadeBindings[key]=info.description;
      if(sadeState.fields[key])sadeState.fields[key].mode='auto';
      // Notificar adaptador
      window.dispatchEvent(new CustomEvent(SADE_EVENT_IN,{detail:{type:'confirm',key}}));
      render();persist();
      show(names[key]+' confirmado e vinculado.');
    }catch(err){show('Não foi possível confirmar: '+(err.message||'erro'));}
  }
  function applySadeBindings(fields){
    // Aplica vínculos automáticos (score >= 70) sem sobrescrever vínculos manuais existentes
    let applied=0;
    for(const [key,info] of Object.entries(fields||{})){
      if(info.mode!=='auto')continue;
      if(!info.description)continue;
      // Não sobrescrever vínculo manual (que não veio do adaptador)
      const isCurrentlyFromSade=!!sadeBindings[key];
      const hasManual=!!cfg.fields[key]&&!isCurrentlyFromSade;
      if(hasManual)continue;
      cfg.fields[key]=info.description;
      sadeBindings[key]=info.description;
      applied++;
    }
    return applied;
  }
  function onSadeStatus(event){
    const payload=event?.detail;
    if(!payload||typeof payload!=='object')return;
    sadeState=payload;
    // Aplicar vínculos automáticos (sem interação do operador)
    if(payload.status==='mapped'||payload.status==='partial'){
      const applied=applySadeBindings(payload.fields);
      if(applied>0){persist();}
    }
    render();renderSadeStatusBar();
  }
  function initSadeIntegration(){
    window.addEventListener(SADE_EVENT_OUT,onSadeStatus);
    // Botão fechar barra de status
    const dismissBtn=$('#sadeDismissBtn');
    if(dismissBtn)dismissBtn.addEventListener('click',()=>{
      window.dispatchEvent(new CustomEvent(SADE_EVENT_IN,{detail:{type:'dismiss'}}));
      $('#sadeStatusBar').hidden=true;
    });
    // Botão nova varredura
    const rescanBtn=$('#sadeRescanBtn');
    if(rescanBtn)rescanBtn.addEventListener('click',()=>{
      sadeBindings={};
      window.dispatchEvent(new CustomEvent(SADE_EVENT_IN,{detail:{type:'rescan'}}));
      show('Nova varredura iniciada…');
    });
    // Pedir status atual ao adaptador (se já rodou antes do content.js)
    window.dispatchEvent(new CustomEvent(SADE_EVENT_IN,{detail:{type:'ping'}}));
  }
  // ── Inicialização ─────────────────────────────────────────────────────────
  async function init(){
    let autoChanged=autoBindFields();render();observeDocs();
    try{
      const saved=await Promise.race([
        bindings.remote('load'),
        new Promise((_,reject)=>setTimeout(()=>reject(Error('timeout')),1200))
      ]);
      if(saved){
        cfg=saved;cfg.fields={...saved.fields};
        autoChanged=autoBindFields()||autoChanged;
        if(hereService){
          if(cfg.hereApiKey)hereService.apiKey=cfg.hereApiKey;
          if(typeof cfg.hereUseMock==='boolean')hereService.useMock=cfg.hereUseMock;
        }
      }
    }catch(err){if(err.message!=='timeout')show('Não foi possível carregar vínculos: '+err.message);}
    render();if(autoChanged)await persist();await loadProfiles();
    initSadeIntegration();
    setInterval(()=>{if(mapsActive||lookupAllowed)checkAddressChanges();},1600);
    try{const active=await mapsMessage('RELATO_MAPS_STATUS');if(active.connected){mapsActive=!mapsManualPause;mapsStatus('Aba do Google Maps conectada. Endereço acompanhado automaticamente.',true);scheduleMapsSync(true);}}catch(_){}
  }
  init();
})();
