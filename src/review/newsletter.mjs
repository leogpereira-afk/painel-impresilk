// Somente demonstração, em memória nesta aba. Mesmo handler e validadores do servidor.
import {atenderNewsletter} from '../../supabase/functions/_shared/newsletter-handler.mjs';
const registros=new Map(),historico=[];
const lista='b0000000-0000-4000-8000-000000000001';
const nova=(id,tipo,dados)=>({id,tipo,dados,versao:1,atualizado_em:new Date().toISOString(),atualizado_por:'Demonstração'});
registros.set(lista,nova(lista,'lista',{nome:'Comércio e lojas (exemplo)',descricao:'Público fictício'}));
const ed='b0000000-0000-4000-8000-000000000002';
registros.set(ed,nova(ed,'edicao',{titulo:'Sua próxima fachada (exemplo)',conteudo:'Uma boa apresentação começa antes de o cliente entrar. Conheça ideias de comunicação visual para sua loja.',listas:[lista],situacao:'rascunho',metricas:{}}));
for(const r of registros.values())historico.push({...r,registro_id:r.id});
const db={from(tabela){let filtros=[],ordem='id',asc=true,limite=201;const q={select(){return q;},eq(k,v){filtros.push(x=>x[k]===v);return q;},gt(k,v){filtros.push(x=>x[k]>v);return q;},order(k,o){ordem=k;asc=o?.ascending!==false;return q;},limit(n){limite=n;return q;},then(resolve){const rows=(tabela==='painel_newsletter_revisoes'?historico:[...registros.values()]).filter(x=>filtros.every(f=>f(x))).sort((a,b)=>(a[ordem]>b[ordem]?1:a[ordem]<b[ordem]?-1:0)*(asc?1:-1)).slice(0,limite);return Promise.resolve({data:structuredClone(rows)}).then(resolve);}};return q;},async rpc(_,{p_id,p_tipo,p_dados,p_versao,p_quem}){
 const a=registros.get(p_id),error=m=>({error:{message:m}});
 if((a && (a.versao!==p_versao || a.tipo!==p_tipo)) || (!a && p_versao!=null))return error('NEWSLETTER_CONFLITO');
 if(a && p_tipo==='contato' && ['descadastrado','bloqueado'].includes(a.dados.situacao) && !['descadastrado','bloqueado'].includes(p_dados.situacao))return error('NEWSLETTER_SUPRIMIDO');
 if(a && p_tipo==='contato' && a.dados.email!==p_dados.email)return error('NEWSLETTER_EMAIL_IMUTAVEL');
 if(p_tipo==='contato' && [...registros.values()].some(x=>x.id!==p_id && x.tipo==='contato' && x.dados.email===p_dados.email))return {error:{code:'23505'}};
 if((p_dados.listas || []).some(id=>registros.get(id)?.tipo!=='lista'))return error('NEWSLETTER_LISTA_INVALIDA');
 const r={...nova(p_id,p_tipo,p_dados),versao:(a?.versao || 0)+1,atualizado_por:p_quem};registros.set(p_id,r);historico.push({...r,registro_id:r.id});return {data:structuredClone(r)};
}};
export async function respostaNewsletter(b,papel){try{return new Response(JSON.stringify(await atenderNewsletter(db,b,{papel,quem:'Demonstração'})),{status:200,headers:{'Content-Type':'application/json'}});}catch(e){return new Response(JSON.stringify({erro:e.message}),{status:e.status || 500,headers:{'Content-Type':'application/json'}});}}
