'use strict';
importScripts('bindings.js','address-engine.js','relato-ia-bg.js');
// sade-adapter.js é injetado como content script junto ao content.js (não precisa de importScripts)
const store=RelatoAgilBindings.server(chrome);
const injecting=new Set();
const SESSION_KEY='relato190.googleMaps.tabs.v1';
const MAPS_URL='https://www.google.com/maps';
const mapConnections=new Map();
const lastQueries=new Map();
let loadConnectionsPromise=null;
async function loadConnections(){
 if(!loadConnectionsPromise)loadConnectionsPromise=chrome.storage.session.get(SESSION_KEY).then(data=>{
  for(const [source,maps] of Object.entries(data?.[SESSION_KEY]||{})){
   if(Number.isInteger(Number(source))&&Number.isInteger(maps))mapConnections.set(Number(source),maps);
  }
 }).catch(()=>{});
 await loadConnectionsPromise;
}
async function saveConnections(){await chrome.storage.session.set({[SESSION_KEY]:Object.fromEntries(mapConnections)});}
function safeAddress(address){const a={};for(const key of ['cidade','rua','numero','bairro'])a[key]=String(address?.[key]||'').replace(/\s+/g,' ').trim().slice(0,140);return a;}
function searchUrl(address){
 const a=safeAddress(address);
 if(!a.cidade||!a.rua)return null;
 const words=[a.rua,a.numero,a.bairro,a.cidade,'Paraná','Brasil'].filter(Boolean).join(', ');
 return {url:'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(words),query:words};
}
async function knownMapsTab(sourceId){
 await loadConnections();
 const id=mapConnections.get(sourceId);
 if(!id)return null;
 try{
  const tab=await chrome.tabs.get(id);
  // Do not commandeer a tab the user has navigated away from Google Maps.
  if(tab.url && !/^https:\/\/(?:www\.)?google\.com\/maps(?:[/?#]|$)/i.test(tab.url)){
   mapConnections.delete(sourceId);lastQueries.delete(sourceId);await saveConnections();return null;
  }
  return tab;
 }catch(_){mapConnections.delete(sourceId);lastQueries.delete(sourceId);await saveConnections();return null;}
}
async function openMaps(sourceId,address){
 let tab=await knownMapsTab(sourceId);
 const search=searchUrl(address);
 if(!tab){
  tab=await chrome.tabs.create({url:search?.url||MAPS_URL,active:true,openerTabId:sourceId});
  mapConnections.set(sourceId,tab.id);lastQueries.set(sourceId,{query:search?.query||'',time:Date.now()});
  await saveConnections();
 }else{
  await chrome.tabs.update(tab.id,{active:true,...(search?{url:search.url}:{})});
  if(search)lastQueries.set(sourceId,{query:search.query,time:Date.now()});
 }
 return {connected:true,mapsTabId:tab.id,query:search?.query||'',opened:!!search};
}
async function syncMaps(sourceId,address,force=false){
 const tab=await knownMapsTab(sourceId);
 if(!tab)return {connected:false,reason:'A aba do Google Maps foi fechada. Abra novamente pelo Relato 190.'};
 const search=searchUrl(address);
 if(!search){
  const previous=lastQueries.get(sourceId);
  if(previous?.query){await chrome.tabs.update(tab.id,{url:MAPS_URL});lastQueries.delete(sourceId);return {connected:true,reset:true,reason:'Endereço incompleto: pesquisa anterior limpa para evitar confusão.'};}
  return {connected:true,skipped:true,reason:'Preencha município e rua para pesquisar.'};
 }
 const previous=lastQueries.get(sourceId);
 if(!force&&previous?.query===search.query)return {connected:true,skipped:true,reason:'Pesquisa já atualizada.'};
 const elapsed=Date.now()-(previous?.time||0);
 if(!force&&elapsed<4000)return {connected:true,skipped:true,retryAfterMs:4000-elapsed+120};
 await chrome.tabs.update(tab.id,{url:search.url});
 lastQueries.set(sourceId,{query:search.query,time:Date.now()});
 return {connected:true,updated:true,query:search.query};
}
// Verificação pública mediante solicitação explícita na interface; não armazena endereços.
const lookups=new Map();
const PROVIDERS={IBGE:'https://servicodados.ibge.gov.br',VIACEP:'https://viacep.com.br',BRASILAPI:'https://brasilapi.com.br'};
async function jsonFrom(url,timeout=6500){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{const response=await fetch(url,{method:'GET',signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const txt=await response.text();if(txt.length>1100000)throw Error('Resposta muito grande.');return JSON.parse(txt);
 }finally{clearTimeout(timer);}
}
let municipiosCache=null,municipiosAt=0;
async function municipiosPR(){
 if(municipiosCache&&Date.now()-municipiosAt<12*3600*1000)return municipiosCache;
 const rows=await jsonFrom(PROVIDERS.IBGE+'/api/v1/localidades/estados/41/municipios',8500);
 if(!Array.isArray(rows)||rows.length<300)throw Error('Lista de municípios indisponível.');
 municipiosCache=rows.map(x=>String(x.nome||'').slice(0,90)).filter(Boolean);municipiosAt=Date.now();return municipiosCache;
}
function safeLookup(message){
 const a=message?.address||{},clean=Relato190Address.clean;
 return {cidade:clean(a.cidade),rua:clean(a.rua),bairro:clean(a.bairro),numero:clean(a.numero),cep:Relato190Address.cep(a.cep)};
}
async function lookupAddress(sourceId,message){
 if(message.consent!==true)throw Error('Consulta externa não autorizada.');
 const address=safeLookup(message),now=Date.now(),id=String(sourceId),prev=lookups.get(id);
 if(prev&&now-prev<2500)throw Error('Aguarde um instante para consultar novamente.');
 lookups.set(id,now);
 const reply={municipios:[],vias:[],cep:null,providers:[],errors:[],address};
 const jobs=[];
 jobs.push((async()=>{
  try{reply.municipios=Relato190Address.rank(address.cidade,await municipiosPR(),6).map(x=>({nome:x.name,similaridade:x.score}));reply.providers.push('IBGE');}
  catch(e){reply.errors.push('IBGE: '+(e.name==='AbortError'?'tempo esgotado':'indisponível'));}
 })());
 if(address.cep.length===8){
  jobs.push((async()=>{
   const responses=await Promise.allSettled([
    jsonFrom(PROVIDERS.VIACEP+'/ws/'+address.cep+'/json/',7000),
    jsonFrom(PROVIDERS.BRASILAPI+'/api/cep/v2/'+address.cep,7500)
   ]);
   for(let i=0;i<responses.length;i++){
    const result=responses[i],source=i===0?'ViaCEP':'BrasilAPI';
    if(result.status==='fulfilled'&&result.value&&!result.value.erro){
     const d=result.value;
     const data={source,cidade:String(d.localidade||d.city||'').slice(0,100),rua:String(d.logradouro||d.street||'').slice(0,140),bairro:String(d.bairro||d.neighborhood||'').slice(0,120),uf:String(d.uf||d.state||''),cep:address.cep};
     const lat=Number(d.location?.coordinates?.latitude),lon=Number(d.location?.coordinates?.longitude);
     if(source==='BrasilAPI'&&d.location?.coordinates?.latitude!=null&&d.location?.coordinates?.longitude!=null&&Number.isFinite(lat)&&Number.isFinite(lon)&&lat<=-1&&lat>=-35&&lon>=-75&&lon<=-30){data.coordinates={lat,lon};}
     (reply.cep||(reply.cep={sources:[],data:[]})).sources.push(source);reply.cep.data.push(data);reply.providers.push(source);
    }else reply.errors.push(source+': CEP não encontrado ou serviço indisponível.');
   }
  })());
 }
 if(address.cidade.length>=3&&address.rua.length>=4){
  jobs.push((async()=>{
   try{
    // Extrai todos os tokens significativos da rua (cada palavra com 3+ chars, sem prefixo).
    // Testa cada token em paralelo para aumentar a chance de encontrar resultado com erro de digitação.
    const name=address.rua.replace(/^(rua|r\.|avenida|av\.|travessa|tv\.?)\s+/i,'').trim();
    const tokens=[...new Set(name.split(/\s+/).filter(w=>w.length>=3))].slice(0,4);
    if(!tokens.length)tokens.push(name.slice(0,20));
    const base=PROVIDERS.VIACEP+'/ws/PR/'+encodeURIComponent(address.cidade)+'/';
    const fetches=tokens.map(t=>jsonFrom(base+encodeURIComponent(t)+'/json/',7000).catch(()=>[]));
    const results=await Promise.all(fetches);
    const seen=new Set();
    for(const data of results){
     if(!Array.isArray(data))continue;
     for(const d of data){
      const key=(String(d.logradouro||'')+String(d.cep||'')).toLowerCase();
      if(seen.has(key))continue;seen.add(key);
      reply.vias.push({rua:String(d.logradouro||'').slice(0,150),bairro:String(d.bairro||'').slice(0,100),cidade:String(d.localidade||'').slice(0,100),cep:String(d.cep||'').slice(0,10),source:'ViaCEP'});
     }
    }
    reply.providers.push('ViaCEP');
   }catch(e){reply.errors.push('ViaCEP/logradouros: indisponível para a consulta.');}
  })());
 }
 await Promise.all(jobs);
 reply.vias.sort((a,b)=>Relato190Address.score(address.rua,b.rua)-Relato190Address.score(address.rua,a.rua));
 reply.vias=reply.vias.slice(0,8);
 return reply;
}
function coordinatesFromMapsUrl(url){
 if(typeof url!=='string'||!/^https:\/\/(?:www\.)?google\.com\/maps(?:\/|[?#]|$)/i.test(url))return null;
 // O Maps normalmente inclui a posição da câmera em /@latitude,longitude,zoom.
 // Isso é uma referência visual do mapa, não a localização confirmada do imóvel.
 const match=url.match(/\/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)(?:,|\/|\?|$)/);
 if(!match)return null;
 const lat=Number(match[1]),lon=Number(match[2]);
 return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-35&&lat<=6&&lon>=-75&&lon<=-30?{lat,lon}:null;
}
async function openStreetView(sourceId,address,coordinates){
 let tab=await knownMapsTab(sourceId);
 const valid=pt=>pt&&Number.isFinite(Number(pt.lat))&&Number.isFinite(Number(pt.lon))&&Math.abs(Number(pt.lat))<=90&&Math.abs(Number(pt.lon))<=180;
 let point=valid(coordinates)?coordinates:null;
 let origin=point?'Coordenada aproximada obtida da fonte de CEP; não representa número de imóvel confirmado':'';
 if(!point&&tab?.url){point=coordinatesFromMapsUrl(tab.url);if(point)origin='Centro da área exibida no Google Maps, não localização confirmada do imóvel';}
 if(!point){
  // Nunca fingir que abriu uma panorâmica quando só conseguimos fazer uma pesquisa.
  // Abrir a aba existente (sem alterar a busca) para o usuário escolher um ponto.
  if(tab){await chrome.tabs.update(tab.id,{active:true});return {opened:true,panorama:false,reason:'Ainda não há coordenadas para abrir o Street View diretamente. Selecione um resultado no Google Maps e clique em Street View novamente. Se não houver panorama, use a camada Street View do Google Maps.'};}
  const search=searchUrl(address);
  if(!search)throw Error('Preencha município e rua antes de abrir o Street View.');
  tab=await chrome.tabs.create({url:search.url,active:true,openerTabId:sourceId});mapConnections.set(sourceId,tab.id);await saveConnections();
  return {opened:true,panorama:false,reason:'Endereço pesquisado no Google Maps. Para abrir o Street View diretamente, selecione um local no mapa e clique novamente em Street View.'};
 }
 const url='https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='+encodeURIComponent(Number(point.lat)+','+Number(point.lon));
 if(tab)await chrome.tabs.update(tab.id,{url,active:true});
 else{tab=await chrome.tabs.create({url,active:true,openerTabId:sourceId});mapConnections.set(sourceId,tab.id);await saveConnections();}
 lastQueries.delete(sourceId);
 return {opened:true,panorama:true,reason:'Street View solicitado para um panorama próximo. '+origin+'. A imagem pode estar distante do imóvel ou indisponível; confirme no Maps.'};
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(message?.type==='RELATO_PR_MUNICIPIOS'){
  if(sender.id!==chrome.runtime.id||!Number.isInteger(sender.tab?.id)){reply({ok:false,error:'Origem não autorizada.'});return false;}
  municipiosPR().then(names=>reply({ok:true,names})).catch(()=>reply({ok:false,error:'Catálogo do IBGE indisponível.'}));return true;
 }

 if(message?.type?.startsWith('RELATO_MAPS_')||message?.type==='RELATO_LOOKUP_ADDRESS'){
  if(sender.id!==chrome.runtime.id||!Number.isInteger(sender.tab?.id)){reply({ok:false,error:'Origem não autorizada.'});return false;}
  const sourceId=sender.tab.id;
  (async()=>{
   if(message.type==='RELATO_MAPS_OPEN')return await openMaps(sourceId,message.address);
   if(message.type==='RELATO_MAPS_SYNC')return await syncMaps(sourceId,message.address,message.force===true);
   if(message.type==='RELATO_MAPS_STATUS')return {connected:!!(await knownMapsTab(sourceId))};
   if(message.type==='RELATO_MAPS_STREETVIEW')return await openStreetView(sourceId,message.address,message.coordinates);
   if(message.type==='RELATO_LOOKUP_ADDRESS')return await lookupAddress(sourceId,message);
   throw Error('Comando não reconhecido.');
  })().then(value=>reply({ok:true,...value})).catch(e=>reply({ok:false,error:e.message||'Não foi possível acessar o Google Maps.'}));
  return true;
 }
 if(message?.type!=='RELATO_AGIL_BINDINGS')return false;
 if(sender.id!==chrome.runtime.id||!Number.isInteger(sender.tab?.id)){reply({ok:false,error:'Origem não autorizada.'});return false;}
 store.dispatch(message,sender).then(value=>reply({ok:true,value})).catch(err=>reply({ok:false,error:err.message||'Não foi possível salvar.'}));
 return true;
});
async function open(tabId,automatic=false){
 if(injecting.has(tabId))return;
 injecting.add(tabId);
 try{
  if(automatic)await chrome.scripting.executeScript({target:{tabId},func:()=>{window.__relatoEssencialAutomatic=true;}});
  // Injetar módulos de tema, serviço HERE, popup e adaptador SADE antes do content.js
  await chrome.scripting.executeScript({target:{tabId},files:['bindings.js','address-engine.js','sade-theme.js','here-service.js','address-popup.js','sade-adapter.js','municipios-pr.js','content.js','relato-tools.js']});
  await chrome.action.setBadgeText({tabId,text:''});
 }finally{injecting.delete(tabId);}
}
chrome.action.onClicked.addListener(async tab=>{
 if(!Number.isInteger(tab.id))return;
 try{await open(tab.id);}catch(_){
  await chrome.action.setBadgeBackgroundColor({tabId:tab.id,color:'#B45309'});
  await chrome.action.setBadgeText({tabId:tab.id,text:'!'});
  await chrome.action.setTitle({tabId:tab.id,title:'Abra um site comum e clique novamente. Para HTML local, habilite acesso a URLs de arquivo.'});
 }
});
chrome.tabs.onRemoved.addListener(async tabId=>{
 await loadConnections();
 let changed=false;
 for(const [source,maps] of mapConnections){
  if(source===tabId||maps===tabId){mapConnections.delete(source);lastQueries.delete(source);changed=true;}
 }
 if(changed)await saveConnections().catch(()=>{});
 store.forgetTab(tabId).catch(()=>{});
});
chrome.tabs.onUpdated.addListener((tabId,change,tab)=>{
 if(change.status!=='complete')return;
 store.canRestore(tabId,tab.url).then(can=>{if(can)return open(tabId,true);}).catch(()=>{});
});
