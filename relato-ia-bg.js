/* Relato 190 v5.9.2: chave Gemini criptografada e histórico temporário sob autorização. */
'use strict';
(() => {
 const P='relato190.v592.', KEY=P+'gemini', HIST=P+'history', SET=P+'settings', DB=P+'vault', ALARM=P+'expire';
 const HOUR=3600000, MAX=20, enc=new TextEncoder(),dec=new TextDecoder();
 const b64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
 const bytes=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
 let keyPromise;
 function encryptionKey(){
  if(keyPromise)return keyPromise;
  keyPromise=new Promise((resolve,reject)=>{
   const req=indexedDB.open(DB,1);
   req.onupgradeneeded=()=>req.result.createObjectStore('secrets');
   req.onerror=()=>reject(req.error);
   req.onsuccess=()=>{
    const db=req.result,tx=db.transaction('secrets','readonly'),get=tx.objectStore('secrets').get('key');
    get.onerror=()=>{db.close();reject(get.error);};
    get.onsuccess=async()=>{
     if(get.result){db.close();resolve(get.result);return;}
     try{
      const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
      const write=db.transaction('secrets','readwrite');
      write.objectStore('secrets').put(key,'key');
      write.oncomplete=()=>{db.close();resolve(key);};
      write.onerror=()=>{db.close();reject(write.error);};
     }catch(e){db.close();reject(e);}
    };
   };
  }).catch(e=>{keyPromise=null;throw e;});
  return keyPromise;
 }
 async function seal(value,scope){
  const key=await encryptionKey(),iv=crypto.getRandomValues(new Uint8Array(12));
  return {iv:b64(iv),data:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(scope)},key,enc.encode(JSON.stringify(value))))};
 }
 async function unseal(payload,scope){
  const key=await encryptionKey(),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(payload.iv),additionalData:enc.encode(scope)},key,bytes(payload.data));
  return JSON.parse(dec.decode(plain));
 }
 async function records(){
  const r=(await chrome.storage.local.get(HIST))[HIST]||[],now=Date.now();
  const valid=r.filter(x=>x&&x.expires>now&&x.expires<=now+HOUR&&x.payload).slice(-MAX);
  if(valid.length!==r.length)await chrome.storage.local.set({[HIST]:valid});
  if(chrome.alarms){
   if(valid.length)await chrome.alarms.create(ALARM,{when:Math.max(now+1000,Math.min(...valid.map(x=>x.expires)))});
   else await chrome.alarms.clear(ALARM);
  }
  return valid;
 }
 async function setting(){return (await chrome.storage.local.get(SET))[SET]||{history:false};}
 async function run(m){
  switch(m.type){
   case 'R190_STATUS':{
    const d=await chrome.storage.local.get(KEY),s=await setting();
    return {configured:!!d[KEY],historyEnabled:s.history===true};
   }
   case 'R190_KEY_SAVE':{
    const key=String(m.key||'').trim();
    // Google AI Studio aceita chaves legadas (AIza) e novas chaves de autenticação (AQ.).
    // Não inferir a validade somente pelo prefixo: o teste real é feito no endpoint.
    if(key.length<20||key.length>256||!/^[A-Za-z0-9._-]+$/.test(key))
     throw Error('Formato incompatível. Copie a chave completa do Google AI Studio.');
    await chrome.storage.local.set({[KEY]:await seal(key,'gemini')});return {saved:true};
   }
   case 'R190_KEY_REMOVE':await chrome.storage.local.remove(KEY);return {saved:true};
   case 'R190_KEY_TEST':{
    // Somente uma frase fictícia; nenhum dado do SADE é consultado ou enviado.
    const r=await run({type:'R190_GEMINI',confirmed:true,text:'Teste de conexão. Responda apenas: OK.'});
    return {connected:!!r.text};
   }
   case 'R190_GEMINI':{
    if(m.confirmed!==true)throw Error('Confirmação de envio necessária.');
    const d=(await chrome.storage.local.get(KEY))[KEY];
    if(!d)throw Error('Configure a chave Gemini nas configurações.');
    const input=String(m.text||'');
    if(!input.trim()||input.length>12000)throw Error('O texto deve ter até 12.000 caracteres.');
    const apiKey=await unseal(d,'gemini'),controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),30000);
    try{
     const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent',{
      method:'POST',headers:{'x-goog-api-key':apiKey,'Content-Type':'application/json'},
      credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal,
      body:JSON.stringify({systemInstruction:{parts:[{text:'Revise o relato em português somente quanto a ortografia, pontuação, clareza e organização. Preserve integralmente fatos, pessoas, locais, horários, incertezas e negativas. Não acrescente nem remova informações. Retorne só o texto revisado.'}]},contents:[{role:'user',parts:[{text:input}]}],generationConfig:{temperature:0.1,maxOutputTokens:4096}})
     });
     if(!response.ok){
      const errors={
       400:'Requisição inválida para o Gemini (HTTP 400).',
       401:'O Google não autenticou a chave (HTTP 401). Confira se está ativa e vinculada ao projeto correto no AI Studio.',
       403:'Chave sem permissão para esta operação (HTTP 403). Confira restrições e acesso ao modelo.',
       404:'Modelo Gemini indisponível para esta chave (HTTP 404).',
       429:'Cota ou limite de requisições do Gemini excedido (HTTP 429).'
      };
      throw Error(errors[response.status]||'Gemini retornou HTTP '+response.status+'. Verifique o serviço.');
     }
     const data=await response.json();
     const text=(data.candidates||[]).flatMap(x=>x.content?.parts||[]).map(x=>x.text||'').join('\n').trim();
     if(!text)throw Error('O Gemini não retornou texto.');
     return {text:text.slice(0,20000)};
    }finally{clearTimeout(timer);}
   }
   case 'R190_HISTORY_ENABLE':{
    const enabled=m.enabled===true;
    await chrome.storage.local.set({[SET]:{history:enabled}});
    if(!enabled)await chrome.storage.local.remove(HIST);
    await records();return {enabled};
   }
   case 'R190_HISTORY_ADD':{
    if(!(await setting()).history)return {saved:false};
    const clean={};
    for(const k of ['nome','telefone','cidade','rua','numero','bairro','complemento','relato'])
     clean[k]=String(m.fields?.[k]||'').slice(0,k==='relato'?15000:300);
    if(!Object.values(clean).some(v=>v.trim()))return {saved:false};
    const now=Date.now(),item={id:crypto.randomUUID(),time:now,expires:now+HOUR,payload:await seal(clean,'history')};
    const all=[...await records(),item].slice(-MAX);
    await chrome.storage.local.set({[HIST]:all});
    await records();return {saved:true};
   }
   case 'R190_HISTORY_LIST':return {items:(await records()).map(({id,time,expires})=>({id,time,expires})).reverse()};
   case 'R190_HISTORY_GET':{
    const item=(await records()).find(x=>x.id===m.id);
    if(!item)throw Error('Conteúdo expirado ou excluído.');
    return {fields:await unseal(item.payload,'history')};
   }
   case 'R190_HISTORY_CLEAR':await chrome.storage.local.remove(HIST);await records();return {cleared:true};
   default:throw Error('Comando não reconhecido.');
  }
 }
 chrome.runtime.onMessage.addListener((m,sender,sendResponse)=>{
  if(!String(m?.type||'').startsWith('R190_'))return false;
  if(sender.id!==chrome.runtime.id||!Number.isInteger(sender.tab?.id)){
   sendResponse({ok:false,error:'Origem não autorizada.'});return false;
  }
  run(m).then(x=>sendResponse({ok:true,...x})).catch(e=>sendResponse({ok:false,error:e.name==='AbortError'?'Tempo limite do Gemini.':String(e.message||e)}));
  return true;
 });
 if(chrome.alarms){
  chrome.alarms.onAlarm.addListener(a=>{if(a.name===ALARM)void records().catch(()=>{});});
 }
 chrome.runtime.onStartup.addListener(()=>{void records().catch(()=>{});});
})();