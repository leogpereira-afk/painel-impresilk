import {API} from '../lib/api.js';
import {comCracha} from '../lib/sessao.js';
async function ler(modulo,params={},signal){
 const url=new URL(`${API}/painel-dados`);url.searchParams.set('modulo',modulo);Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
 const r=await comCracha(url.toString(),{signal});const b=await r.json().catch(()=>null);if(!r.ok)throw new Error(b?.erro||'Não foi possível atualizar. Tente novamente.');return b;
}
export async function getCrm(signal){
 if(import.meta.env.MODE==='review'){
  const {getOrcamentos}=await import('./demo/dados.js');const cliente=getOrcamentos().find(o=>o.situacao==='aberto');
  return {atualizadoEm:new Date().toISOString(),escopo:'ATIVO',grupos:[{id:'1',nome:'Comercial · demonstração',fases:[{id:'1',nome:'Primeiro contato'},{id:'2',nome:'Negociação'},{id:'3',nome:'Visita técnica'}]}],cards:[{id:'1',clienteId:cliente.clienteId,cliente:cliente.cliente,titulo:'Fachada e comunicação visual',grupoId:'1',faseId:'2',fase:'Negociação',responsavel:'Equipe · demonstração',valor:12500,origem:'Indicação',status:'EM_ABERTO'}]};
 }
 return ler('crm',{},signal);
}
export async function getCadastroCliente(id,signal){
 if(import.meta.env.MODE==='review')return {cliente:{id,nome:'Cliente de demonstração',origem:'Indicação',classificacao:'Empresa',responsavel:'Equipe · demonstração',contatos:[]},atualizadoEm:new Date().toISOString()};
 return ler('cliente360',{id},signal);
}
