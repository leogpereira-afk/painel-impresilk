import {API} from '../lib/api.js';
import {comCracha,mensagemDoStatus} from '../lib/sessao.js';
export async function prepararParticipacaoLicitacao({relatorioId,itemId},signal){
 const r=await comCracha(`${API}/painel-ativos`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'prepararParticipacaoLicitacao',relatorioId,itemId}),signal});
 const b=await r.json().catch(()=>null);
 if(!r.ok||!b||b.ok!==true||b.erro)throw Object.assign(new Error(b?.erro||mensagemDoStatus(r.status)),{status:r.status});
 if(b.modo!=='preparacao_interna_acervo_bot'||b.item?.tipo!=='licitacao'||!b.item?.id||typeof b.repetido!=='boolean'||!Array.isArray(b.avisos))throw new Error('O acompanhamento não foi confirmado. Atualize a lista antes de tentar novamente.');
 return b;
}
