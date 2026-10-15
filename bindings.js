/* RelatoAgilBindings — referências de campos; os valores do atendimento não são salvos. */
(function(){
 'use strict';
 const keys=['relato','cidade','rua','bairro','numero','complemento','nome','telefone','cep'];
 const clean=v=>String(v??'').replace(/\s+/g,' ').trim();
 function scopeOf(url){const u=new URL(url);if(!['http:','https:','file:'].includes(u.protocol))throw Error('Página não suportada.');return u.protocol==='file:'?u.href:u.origin+u.pathname;}
 function control(el){
  if(!el||el.nodeType!==1)return null;
  if(['INPUT','TEXTAREA','SELECT'].includes(el.tagName))return el;
  return el.closest?.('[contenteditable="true"],[contenteditable="plaintext-only"]')||el;
 }
 function addressField(el){el=control(el);return !!el&&(el.tagName==='TEXTAREA'||el.tagName==='SELECT'&&!el.multiple||el.tagName==='INPUT'&&['text','search','tel','number','email','url'].includes(el.type)||el.isContentEditable);}
 function valueOf(el){
  if(el.tagName==='SELECT')return el.value===''?'':clean(el.selectedOptions[0]?.textContent);
  return clean(el.isContentEditable||!['INPUT','TEXTAREA'].includes(el.tagName)?(el.innerText??el.textContent):el.value);
 }
 function labelOf(el){
  const labels=[...(el.labels||[])];
  const text=labels.map(label=>{const copy=label.cloneNode(true);for(const input of copy.querySelectorAll('input,textarea,select,button'))input.remove();return clean(copy.textContent);}).filter(Boolean).join(' ');
  return (text||clean(el.getAttribute('aria-label'))).slice(0,180);
 }
 function domPath(el){
  const parts=[];while(el?.nodeType===1){let index=1;for(let prev=el.previousElementSibling;prev;prev=prev.previousElementSibling)if(prev.tagName===el.tagName)index++;parts.unshift(el.tagName.toLowerCase()+':nth-of-type('+index+')');el=el.parentElement;}
  return parts.join(' > ');
 }
 function locator(el){
  let src='';if(['IFRAME','FRAME'].includes(el.tagName))try{src=scopeOf(el.src||'about:blank');}catch(_){}
  return {tag:el.tagName,type:el.tagName==='INPUT'?el.type:'',id:el.id||'',name:el.getAttribute('name')||'',label:labelOf(el),placeholder:el.getAttribute('placeholder')||'',autocomplete:el.getAttribute('autocomplete')||'',form:el.form?.id||'',src,path:domPath(el)};
 }
 function describe(el,top=document){
  const field=locator(el),contexts=[];let node=el;
  for(let i=0;i<12;i++){
   const root=node.getRootNode();
   if(root.host){contexts.unshift({kind:'shadow',locator:locator(root.host)});node=root.host;continue;}
   if(root===top)return {version:1,contexts,field};
   const frame=root.defaultView?.frameElement;if(!frame)throw Error('Não foi possível identificar este campo na página.');
   contexts.unshift({kind:'frame',locator:locator(frame)});node=frame;
  }
  throw Error('Este campo está em uma estrutura de página não suportada.');
 }
 function find(root,desc,context=false){
  const compatible=el=>el.tagName===desc.tag&&(!desc.type||el.type===desc.type)&&(!desc.form||el.form?.id===desc.form);
  const items=[...root.querySelectorAll(desc.tag.toLowerCase())].filter(compatible);
  const unique=items=>{
   if(items.length!==1)return null;const el=items[0];
   if(el.id&&[...root.querySelectorAll('[id]')].filter(candidate=>candidate.id===el.id).length!==1)return null;
   return el;
  };
  if(desc.id){
   const identified=[...root.querySelectorAll('[id]')].filter(el=>el.id===desc.id);
   if(identified.length){const el=unique(identified);return el&&compatible(el)&&(!desc.name||el.getAttribute('name')===desc.name)&&(!desc.label||labelOf(el)===desc.label)?el:null;}
  }
  if(desc.name){const named=items.filter(el=>el.getAttribute('name')===desc.name);if(named.length)return unique(named.filter(el=>!desc.label||labelOf(el)===desc.label));}
  if(desc.label){const labelled=items.filter(el=>labelOf(el)===desc.label);if(labelled.length)return unique(labelled);}
  if(desc.placeholder){const placeholders=items.filter(el=>el.getAttribute('placeholder')===desc.placeholder);if(placeholders.length)return unique(placeholders);}
  if(desc.autocomplete){const autocomplete=items.filter(el=>el.getAttribute('autocomplete')===desc.autocomplete);if(autocomplete.length)return unique(autocomplete);}
  if(context&&desc.src){const matching=items.filter(el=>{try{return scopeOf(el.src)===desc.src;}catch(_){return false;}});if(matching.length)return unique(matching);}
  // Sem um identificador único, uma mudança na ordem dos campos exige nova seleção.
  const only=unique(items);if(!only||desc.id||desc.name||desc.label||desc.placeholder||desc.autocomplete)return null;
  try{return root.querySelector(desc.path)===only?only:null;}catch(_){return null;}
 }
 function resolve(description,top=document){
  if(!description)return null;let root=top;
  try{for(const step of description.contexts){const host=find(root,step.locator,true);if(!host)return null;root=step.kind==='shadow'?host.shadowRoot:host.contentDocument;if(!root)return null;}return find(root,description.field);}catch(_){return null;}
 }
 function documents(top=document){
  const docs=[],visited=new Set();
  function collect(doc){if(!doc||visited.has(doc))return;visited.add(doc);docs.push(doc);const roots=[doc];for(let i=0;i<roots.length;i++)for(const el of roots[i].querySelectorAll('*')){if(el.shadowRoot)roots.push(el.shadowRoot);if(['IFRAME','FRAME'].includes(el.tagName))try{collect(el.contentDocument);}catch(_){}}}
  collect(top);return docs;
 }
 function safeLocator(raw){
  if(!raw||typeof raw!=='object'||!/^[A-Z][A-Z0-9-]{0,80}$/.test(raw.tag))throw Error('Referência de campo inválida.');
  const result={};for(const key of ['tag','type','id','name','label','placeholder','autocomplete','form','src','path']){if(typeof raw[key]!=='string'||raw[key].length>(key==='path'?2400:600))throw Error('Referência de campo inválida.');result[key]=raw[key];}return result;
 }
 function safeDescription(raw){
  if(!raw||raw.version!==1||!Array.isArray(raw.contexts)||raw.contexts.length>12)throw Error('Referência de campo inválida.');
  return {version:1,contexts:raw.contexts.map(c=>{if(!['frame','shadow'].includes(c.kind))throw Error('Referência de campo inválida.');return {kind:c.kind,locator:safeLocator(c.locator)};}),field:safeLocator(raw.field)};
 }
 function config(raw={}){
  const fields={};for(const key of keys)if(raw.fields?.[key])fields[key]=safeDescription(raw.fields[key]);
  const result={version:1,fields,mode:raw.mode==='integrated'?'integrated':'normal',theme:['page','light','dark'].includes(raw.theme)?raw.theme:'page',sidebarOpen:raw.sidebarOpen!==false,complementSkipped:raw.complementSkipped===true,proportion:raw.proportion==='docked'?'docked':'overlay',sidebarSide:raw.sidebarSide==='left'?'left':'right',sidebarWidth:[360,420,500].includes(Number(raw.sidebarWidth))?Number(raw.sidebarWidth):420,profileAuto:raw.profileAuto!==false,separator:raw.separator==='-'?'-':'|',toolbarMode:['follow','free','docked'].includes(raw.toolbarMode)?raw.toolbarMode:'follow',toolbarExpanded:raw.toolbarExpanded===true};
  if(raw.toolbarPosition&&Number.isFinite(raw.toolbarPosition.x)&&Number.isFinite(raw.toolbarPosition.y)){result.toolbarPosition={x:Math.min(1,Math.max(0,raw.toolbarPosition.x)),y:Math.min(1,Math.max(0,raw.toolbarPosition.y))};}
  if(JSON.stringify(result).length>64000)throw Error('Referências de campo muito grandes.');return result;
 }
 function server(api){
  const storageKey='relatoagil.bindings.v1',profilesKey='relato190.profiles.v1',tabKey=id=>'relatoagil.binding-tab.'+id;let queue=Promise.resolve();
  function serial(job){const next=queue.then(job);queue=next.catch(()=>{});return next;}
  function siteKey(url){const u=new URL(url);return u.protocol==='file:'?u.href:u.origin;}
  async function remember(tabId,scope){await api.storage.session.set({[tabKey(tabId)]:{scope}});}
  return {
   dispatch(request,sender){return serial(async()=>{
    if(sender.frameId!==0&&sender.frameId!==undefined)throw Error('Vínculos só podem ser salvos pela página principal.');
    const scope=scopeOf(sender.url||sender.tab.url),data=(await api.storage.local.get(storageKey))[storageKey]||{version:1,sites:{}};
    if(request.action==='profiles.list'){
      const all=(await api.storage.local.get(profilesKey))[profilesKey]||{};
      return (all[siteKey(scope)]||[]).map(p=>({id:p.id,name:p.name,path:p.path,fields:p.fields,createdAt:p.createdAt}));
    }
    if(request.action==='profiles.save'){
      const all=(await api.storage.local.get(profilesKey))[profilesKey]||{};
      const key=siteKey(scope),arr=all[key]||[];
      const name=String(request.name||'').replace(/[\u0000-\u001f<>]/g,'').trim().slice(0,48);
      if(!name)throw Error('Informe um nome para o perfil.');
      const saved=config(request.config),id=String(request.id||'').slice(0,70)||'p-'+Date.now()+'-'+Math.random().toString(36).slice(2,9);
      const profile={id,name,path:new URL(scope).pathname,fields:saved.fields,createdAt:Date.now()};
      all[key]=[...arr.filter(p=>p.id!==id),profile].slice(-12);
      await api.storage.local.set({[profilesKey]:all});return {id};
    }
    if(request.action==='profiles.delete'){
      const all=(await api.storage.local.get(profilesKey))[profilesKey]||{};
      const key=siteKey(scope),arr=all[key]||[];
      all[key]=arr.filter(p=>p.id!==String(request.id||''));
      await api.storage.local.set({[profilesKey]:all});return true;
    }
    if(request.action==='load'){const saved=data.sites?.[scope];if(saved&&Object.keys(saved.fields||{}).length)await remember(sender.tab.id,scope);return saved?config(saved):null;}
    if(request.action==='save'){
     const saved=config(request.config);data.sites=data.sites||{};
     data.sites[scope]={...saved,savedAt:Date.now()};if(Object.keys(saved.fields).length){await remember(sender.tab.id,scope);}else{await api.storage.session.remove(tabKey(sender.tab.id));}
     const sorted=Object.entries(data.sites).sort((a,b)=>(b[1].savedAt||0)-(a[1].savedAt||0));data.sites=Object.fromEntries(sorted.slice(0,100));
     await api.storage.local.set({[storageKey]:data});return saved;
    }
    throw Error('Operação de vínculo desconhecida.');
   });},
   async canRestore(tabId,url){
    if(!url)return false;const scope=scopeOf(url),session=(await api.storage.session.get(tabKey(tabId)))[tabKey(tabId)];
    if(session?.scope!==scope)return false;
    const data=(await api.storage.local.get(storageKey))[storageKey],saved=data?.sites?.[scope];
    if(saved&&Object.keys(saved.fields||{}).length>0)return true;
    const all=(await api.storage.local.get(profilesKey))[profilesKey]||{};
    return (all[siteKey(url)]||[]).some(p=>p.path===new URL(url).pathname);
   },
   forgetTab(tabId){return api.storage.session.remove(tabKey(tabId));}
  };
 }
 async function remote(action,settings,extra={}){
  if(!globalThis.chrome?.runtime?.sendMessage)throw Error('Reabra a extensão para salvar os vínculos.');
  const result=await chrome.runtime.sendMessage({type:'RELATO_AGIL_BINDINGS',action,config:settings,...extra});
  if(!result?.ok)throw Error(result?.error||'Não foi possível salvar os vínculos.');return result.value;
 }
 globalThis.RelatoAgilBindings={keys,scopeOf,control,addressField,valueOf,labelOf,describe,resolve,documents,config,server,remote};
})();

