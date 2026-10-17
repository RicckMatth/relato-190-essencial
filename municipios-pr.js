/* Catálogo inicial de municípios do Paraná; catálogo integral carregado do IBGE pela extensão. */
(() => {
 'use strict';
 const initial=['Pato Branco','Curitiba','Colombo','Pinhais','São José dos Pinhais','Almirante Tamandaré','Campina Grande do Sul','Araucária','Piraquara','Campo Largo','Fazenda Rio Grande','Quatro Barras','Paranaguá','Londrina','Maringá','Cascavel','Ponta Grossa','Guarapuava','Foz do Iguaçu','Francisco Beltrão','Dois Vizinhos','Marmeleiro','Palmas','Toledo','Umuarama','Apucarana','Arapongas','Cambé','Rolândia','Castro','Irati','União da Vitória','Telêmaco Borba','Paranavaí','Campo Mourão'];
 globalThis.RelatoPRMunicipios=initial;
 chrome.runtime.sendMessage({type:'RELATO_PR_MUNICIPIOS'}).then(r=>{
  if(!r?.ok||!Array.isArray(r.names)||r.names.length<300)return;
  globalThis.RelatoPRMunicipios=r.names;
  window.dispatchEvent(new CustomEvent('relato190:municipios-ready'));
 }).catch(()=>{});
})();