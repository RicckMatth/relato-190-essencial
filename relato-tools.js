/* Relato 190 v5.9.2 — CAPS, Gemini confirmado e histórico criptografado de 1h. */
(() => {
 'use strict';
 if(window.__relatoTools592)return;
 window.__relatoTools592=true;
 const root=document.getElementById('relato190-essencial-root'),shadow=root?.shadowRoot,b=globalThis.RelatoAgilBindings;
 if(!shadow||!b){window.__relatoTools592=false;return;}
 const $=id=>shadow.getElementById(id);
 const names=['nome','telefone','cidade','rua','numero','bairro','complemento','relato'];
 const MSG='Esse conteúdo desaparece após 1 hora, não sendo possível consultar novamente.';
 let saved={},auto={},enabled=false,original='',destination=null,working=false;
 const api=async(type,extra={})=>{
  const r=await chrome.runtime.sendMessage({type,...extra});
  if(!r?.ok)throw Error(r?.error||'Operação não concluída.');
  return r;
 };
 const note=s=>{
  const toast=shadow.querySelector('.toast');
  if(!toast)return;
  toast.textContent=s;toast.hidden=false;setTimeout(()=>{toast.hidden=true;},4800);
 };
 function field(k){
  for(const desc of [auto[k],saved[k]]){
   if(!desc)continue;
   try{const el=b.resolve(desc,document);if(el?.isConnected)return el;}catch(_){}
  }
  return null;
 }
 function read(el){return !el?'':String(el.isContentEditable?el.innerText:el.value||'');}
 function write(el,v){
  if(!el?.isConnected||el.disabled||el.readOnly)throw Error('Campo indisponível ou bloqueado.');
  const win=el.ownerDocument.defaultView;
  if(el.tagName==='TEXTAREA'||el.tagName==='INPUT'){
   const prototype=el.tagName==='TEXTAREA'?win.HTMLTextAreaElement.prototype:win.HTMLInputElement.prototype;
   const setter=Object.getOwnPropertyDescriptor(prototype,'value')?.set;
   if(setter)setter.call(el,v);else el.value=v;
  }else if(el.isContentEditable)el.textContent=v;
  else throw Error('Destino não é um campo de texto.');
  el.dispatchEvent(new win.Event('input',{bubbles:true}));
  el.dispatchEvent(new win.Event('change',{bubbles:true}));
 }
 function btn(id,label,title,fn){
  const el=document.createElement('button');el.id=id;el.type='button';el.textContent=label;el.title=title;
  el.addEventListener('click',fn);return el;
 }
 function caps(){
  try{const el=field('relato');if(!el)throw Error('Campo principal não encontrado.');
   write(el,read(el).toLocaleUpperCase('pt-BR'));note('Texto principal convertido para maiúsculas.');
  }catch(e){note(e.message);}
 }
 const toolbar=shadow.querySelector('.toolbar');
 const quick=toolbar?.querySelector('#quick');
 if(toolbar&&quick){quick.after(btn('relatoCaps','CAPS','Converter todo o relato para maiúsculas',caps),btn('relatoGemini','IA','Revisar texto com Gemini',openReview));}
 const css=document.createElement('style');
 css.textContent=[
 '.r190Settings{margin-top:13px;border:1px solid var(--relato-border,#a7bec9);padding:12px;border-radius:10px;color:var(--relato-text,#16323c);font-size:12px;background:var(--relato-surface,#f8fbfc)}',
 '.r190Settings h3{margin:0 0 8px;font-size:14px}.r190Settings p{margin:6px 0;line-height:1.45}',
 '.r190Settings label{display:block;margin:7px 0}.r190Settings input[type=password]{width:100%;padding:9px;border:1px solid #aac4ca;border-radius:6px;box-sizing:border-box}',
 '.r190Settings button{margin:5px 5px 5px 0;padding:7px 10px;border-radius:7px;border:1px solid #9db9c8;cursor:pointer;background:#edf5f8;color:#153a4d;font-size:11px}',
 '.r190Warning{font-size:11px;color:var(--relato-text-muted,#526c79);line-height:1.5}',
 '.r190Overlay{position:fixed;inset:0;background:rgba(5,18,28,.55);z-index:2147483647;display:grid;place-items:center;padding:12px;font:13px Inter,Arial,sans-serif}',
 '.r190Overlay[hidden]{display:none!important}.r190Dialog{background:var(--relato-surface,#fff);color:var(--relato-text,#12313c);border:1px solid var(--relato-border,#a6c1c9);border-radius:14px;max-width:630px;width:min(100%,630px);max-height:90vh;overflow:auto;padding:19px;box-shadow:0 18px 55px #0006}',
 '.r190Dialog h3{margin:0 0 10px;font-size:17px}.r190Dialog textarea{display:block;box-sizing:border-box;width:100%;height:210px;resize:vertical;border:1px solid #b5c5ce;border-radius:8px;padding:10px;font:13px/1.5 system-ui;margin-top:10px}',
 '.r190Actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.r190Actions button{border:1px solid #90aab9;padding:9px 12px;border-radius:8px;background:#eff6f9;color:#184356;cursor:pointer;font-weight:700}',
 '.r190Actions button.primary{background:#17617d;color:white}.r190Actions button[hidden],.r190Dialog [hidden]{display:none!important}',
 '.r190Spinner{display:inline-block;height:18px;width:18px;border:3px solid #bad7e1;border-top-color:#16799b;border-radius:50%;animation:r190Spin .7s linear infinite;vertical-align:middle;margin-right:8px}@keyframes r190Spin{to{transform:rotate(360deg)}}',
 '.r190History{display:grid;gap:5px;margin-top:7px}.r190History button{text-align:left;display:block;width:100%}'
 ].join('\n');
 shadow.append(css);
 const settings=document.createElement('section');settings.className='r190Settings';
 settings.innerHTML='<h3>Ferramentas CAPS, Gemini e histórico</h3>'
 +'<p class="r190Warning">A chave Gemini fica criptografada localmente. Após salvar, não é necessário informar senha a cada consulta. Cada envio de texto exige confirmação.</p>'
 +'<label>Chave Gemini API <input type="password" id="r190ApiKey" autocomplete="off" placeholder="Cole sua chave Gemini"></label>'
 +'<button type="button" id="r190SaveKey">Salvar chave</button><button type="button" id="r190TestKey">Testar conexão</button><button type="button" id="r190DeleteKey">Apagar chave</button>'
 +'<p class="r190Warning">Aceita chaves padrão AIza e chaves de autenticação AQ. Salvar não garante funcionamento: use Testar conexão, que envia apenas uma mensagem fictícia.</p>'
 +'<p id="r190KeyStatus" aria-live="polite"></p>'
 +'<label><input type="checkbox" id="r190HistoryOn"> Habilitar histórico automático ao clicar em Gerar Ocorrência</label>'
 +'<p class="r190Warning">O histórico pode conter dados pessoais. Habilite apenas com autorização da instituição. '+MSG+'</p>'
 +'<button type="button" id="r190ListHistory">Consultar histórico</button><button type="button" id="r190ClearHistory">Apagar histórico</button>'
 +'<div class="r190History" id="r190HistoryItems"></div>';
 shadow.querySelector('#settingsView')?.append(settings);
 const overlay=document.createElement('div');overlay.className='r190Overlay';overlay.hidden=true;overlay.id='r190Overlay';
 overlay.innerHTML='<div class="r190Dialog" role="dialog" aria-modal="true" aria-labelledby="r190Title">'
 +'<h3 id="r190Title">Revisão de relato com Gemini</h3>'
 +'<p id="r190Message" aria-live="polite"></p>'
 +'<div id="r190Loading" hidden><span class="r190Spinner"></span><strong>Gemini está analisando o texto...</strong></div>'
 +'<textarea id="r190Output" aria-label="Resultado revisado do Gemini" hidden></textarea>'
 +'<div class="r190Actions"><button type="button" id="r190Cancel">Cancelar / Fechar</button>'
 +'<button type="button" class="primary" id="r190Confirm">Confirmar envio ao Gemini</button>'
 +'<button type="button" class="primary" id="r190Merge" hidden>Mesclar texto</button></div></div>';
 shadow.append(overlay);
 function close(){if(working)return;overlay.hidden=true;destination=null;original='';$('r190Output').value='';}
 function show(){overlay.hidden=false;$('r190Loading').hidden=true;$('r190Output').hidden=true;$('r190Confirm').hidden=false;$('r190Merge').hidden=true;$('r190Cancel').disabled=false;$('r190Confirm').disabled=false;}
 async function openReview(){
  if(working)return;
  destination=field('relato');original=read(destination);
  show();$('r190Title').textContent='Revisão de relato com Gemini';
  if(!destination||!original.trim()){$('r190Message').textContent='O campo de relato está vazio ou não foi encontrado.';$('r190Confirm').hidden=true;return;}
  try{
   const state=await api('R190_STATUS');
   if(!state.configured){$('r190Message').textContent='Salve sua chave Gemini em Configurações antes de utilizar IA.';$('r190Confirm').hidden=true;return;}
   $('r190Message').textContent='Deseja enviar este texto ao Gemini? É um serviço externo. Nenhuma alteração será aplicada sem você clicar em Mesclar. Use somente dados fictícios ou informações cujo envio tenha sido autorizado.';
  }catch(e){$('r190Message').textContent=e.message;$('r190Confirm').hidden=true;}
 }
 $('r190Cancel').addEventListener('click',close);
 $('r190Confirm').addEventListener('click',async()=>{
  if(working)return;
  if(!destination||read(destination)!==original){$('r190Message').textContent='O texto mudou. Abra uma nova revisão.';return;}
  working=true;$('r190Confirm').disabled=true;$('r190Cancel').disabled=true;$('r190Loading').hidden=false;
  $('r190Message').textContent='Enviando para análise autorizada. Aguarde...';
  try{
   const r=await api('R190_GEMINI',{confirmed:true,text:original});
   $('r190Output').value=r.text;$('r190Output').hidden=false;$('r190Merge').hidden=false;$('r190Confirm').hidden=true;
   $('r190Message').textContent='Análise concluída. Revise o texto antes de mesclar.';
  }catch(e){$('r190Message').textContent='Não foi possível analisar: '+e.message;$('r190Confirm').disabled=false;}
  finally{working=false;$('r190Loading').hidden=true;$('r190Cancel').disabled=false;}
 });
 $('r190Merge').addEventListener('click',()=>{
  try{if(!destination?.isConnected||read(destination)!==original)throw Error('O texto original mudou. Refaça a análise.');
   const revised=$('r190Output').value.trim();if(!revised)throw Error('Resultado vazio.');
   write(destination,revised);close();note('Texto revisado aplicado ao relato.');
  }catch(e){$('r190Message').textContent=e.message;}
 });
 $('r190SaveKey').addEventListener('click',async()=>{
  try{await api('R190_KEY_SAVE',{key:$('r190ApiKey').value});$('r190ApiKey').value='';await status();note('Chave criptografada e salva.');}
  catch(e){note('Chave não salva: '+e.message);}
 });
 $('r190TestKey').addEventListener('click',async()=>{
  const button=$('r190TestKey'),statusEl=$('r190KeyStatus');
  button.disabled=true;statusEl.textContent='Verificando conexão com o Gemini... Aguarde.';
  try{
   const result=await api('R190_KEY_TEST');
   statusEl.textContent=result.connected?'Conexão verificada: Gemini respondeu ao teste.':'O Gemini não retornou conteúdo no teste.';
  }catch(e){statusEl.textContent='Falha na conexão: '+e.message;}
  finally{button.disabled=false;}
 });
 $('r190DeleteKey').addEventListener('click',async()=>{
  if(!confirm('Apagar a chave Gemini desta instalação?'))return;
  try{await api('R190_KEY_REMOVE');await status();}catch(e){note(e.message);}
 });
 async function status(){
  const s=await api('R190_STATUS');enabled=s.historyEnabled;
  $('r190HistoryOn').checked=enabled;$('r190KeyStatus').textContent=s.configured?'Chave Gemini configurada.':'Chave Gemini não configurada.';
 }
 $('r190HistoryOn').addEventListener('change',async e=>{
  const flag=e.target.checked;
  if(flag&&!confirm('Ativar histórico automático criptografado por 1 hora? Isso armazenará dados de atendimentos neste computador. Confirme apenas com autorização institucional.')){e.target.checked=false;return;}
  try{await api('R190_HISTORY_ENABLE',{enabled:flag});enabled=flag;note(flag?'Histórico ativado. '+MSG:'Histórico desativado e apagado.');}
  catch(err){e.target.checked=enabled;note(err.message);}
 });
 $('r190ListHistory').addEventListener('click',async()=>{
  const container=$('r190HistoryItems');container.replaceChildren();
  try{const result=await api('R190_HISTORY_LIST');if(!result.items.length){container.textContent='Nenhum registro disponível. '+MSG;return;}
   const p=document.createElement('p');p.textContent=MSG;container.append(p);
   for(const item of result.items){
    const button=btn('','Registro de '+new Date(item.time).toLocaleString('pt-BR'),'Abrir registro histórico',async()=>{
     try{const r=await api('R190_HISTORY_GET',{id:item.id});
      show();destination=null;original='';$('r190Title').textContent='Histórico (somente leitura)';
      $('r190Message').textContent=MSG;$('r190Confirm').hidden=true;
      $('r190Output').hidden=false;$('r190Output').value=Object.entries(r.fields).map(([k,v])=>k.toUpperCase()+': '+v).join('\n');
     }catch(err){note(err.message);}
    });container.append(button);
   }
  }catch(err){container.textContent=err.message;}
 });
 $('r190ClearHistory').addEventListener('click',async()=>{
  if(!confirm('Excluir definitivamente os registros disponíveis?'))return;
  try{await api('R190_HISTORY_CLEAR');$('r190HistoryItems').replaceChildren();note('Histórico apagado.');}catch(e){note(e.message);}
 });
 function snapshot(){const result={};for(const k of names)result[k]=read(field(k)).slice(0,k==='relato'?15000:300);return result;}
 function isSade(){return /\/syspm-web\/public\//i.test(location.pathname)||/teste[-_]sade|simulador/i.test(location.pathname);}
 function generateClick(e){
  if(!enabled||!isSade())return;
  const el=e.target?.closest?.('a,button,input[type="submit"]');if(!el)return;
  const label=String(el.textContent||el.value||'').trim(),href=el.getAttribute('href')||'';
  if(el.id!=='menu-atendimento-save'&&!/\/syspm-web\/public\/atendimento\/saveLegado/.test(href)&&!/^(gerar|salvar|registrar)\s+ocorr[êe]ncia/i.test(label))return;
  const fields=snapshot();if(!Object.values(fields).some(v=>v.trim()))return;
  void api('R190_HISTORY_ADD',{fields}).then(r=>{if(r.saved)note('Histórico salvo. '+MSG);}).catch(e=>note('Histórico não salvo: '+e.message));
 }
 const seen=new WeakSet(),frames=new WeakSet();
 function watchDocs(){
  for(const doc of b.documents(document)){
   if(!seen.has(doc)){seen.add(doc);doc.addEventListener('click',generateClick,true);}
   for(const frame of doc.querySelectorAll('iframe,frame')){
    if(frames.has(frame))continue;frames.add(frame);
    frame.addEventListener('load',()=>setTimeout(watchDocs,200));
   }
  }
 }
 watchDocs();
 const observer=new MutationObserver(records=>{
  if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.matches?.('iframe,frame')||n.querySelector?.('iframe,frame')))))setTimeout(watchDocs,200);
 });
 observer.observe(document.documentElement,{childList:true,subtree:true});
 window.addEventListener('relato190:sade:status',e=>{
  const state=e.detail;
  if(!state)return;
  if(['waiting','unavailable','dismissed'].includes(state.status)){auto={};return;}
  for(const [k,entry] of Object.entries(state.fields||{})){
   if(entry.mode==='auto'&&entry.description)auto[k]=entry.description;
  }
 });
 window.dispatchEvent(new CustomEvent('relato190:sade:command',{detail:{type:'ping'}}));
 b.remote('load').then(cfg=>saved=cfg?.fields||{}).catch(()=>{});
 chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='local'&&changes['relatoagil.bindings.v1'])void b.remote('load').then(cfg=>saved=cfg?.fields||{}).catch(()=>{});
 });
 void status().catch(e=>note(e.message));
})();