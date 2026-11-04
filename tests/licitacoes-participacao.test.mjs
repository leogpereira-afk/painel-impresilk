import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import * as acesso from '../supabase/functions/_shared/patrimonio-acesso.mjs';
import * as agenda from '../supabase/functions/_shared/licitacoes-agenda.mjs';
import {atenderParticipacaoLicitacao} from '../supabase/functions/_shared/licitacoes-participacao-handler.mjs';
import {montarParticipacao,prazoParticipacao,MODO_PREPARACAO_LICITACAO} from '../supabase/functions/_shared/licitacoes-participacao.mjs';
const agora=new Date('2026-11-03T15:00:00Z');
const sessao={sub:'operador-ficticio',nome:'Operador fictício',perms:['licitacoes','calendario-empresa']};
const selecao={relatorioId:'pesquisa-ficticia',itemId:'item-1'};
function pesquisa(patch={}){return {estado:'disponivel',id:selecao.relatorioId,origem:'relatorio_publico_licitacoes',somenteLeitura:true,hash:'a'.repeat(64),geradoEm:'2026-11-03T12:00:00Z',oportunidades:[{id:'item-1',orgao:'Órgão fictício',processo:'Processo 01',item:'Placas',lote:'',produto:'Sinalização fictícia',classificacao:'GO',prazo:'2026-11-04T12:00:00Z',oficialUrl:'https://example.com/edital',exigencias:['Ler especificação do material.','Conferir dimensões e instalação.'],proximaAcao:'Conferir edital.'}],...patch};}
function banco({antesRpc,errorLeitura=false}={}){
 const state={rows:[],writes:[],reads:[]};
 const db={from(){let filtros=[];const q={select(){return q;},eq(k,v){filtros.push([k,v]);return q;},order(){return q;},async maybeSingle(){const result=run();return {...result,data:result.data?.[0]||null};},then(a,b){return Promise.resolve(run()).then(a,b);}};
  function run(){state.reads.push(structuredClone(filtros));if(errorLeitura)return {error:{message:'ERRO-PRIVADO'}};return {data:structuredClone(state.rows.filter(r=>filtros.every(([k,v])=>r[k]===v))),error:null};}return q;
 },async rpc(nome,p){
  if(antesRpc){const r=await antesRpc(nome,p,state);if(r)return r;}
  const ant=state.rows.find(r=>r.id===p.p_id&&r.colecao==='ativo');
  if(nome==='painel_licitacao_preparar'){
   if(state.rows.some(r=>r.id===p.p_id&&r.colecao==='ativo_lixeira'))return {error:{code:'40001',message:'RETIRADO-PRIVADO'}};
   if(ant)return {data:{item:structuredClone(ant.registro),repetido:true},error:null};
  }else {assert.equal(nome,'painel_registro_gravar');if(JSON.stringify(ant?.registro||null)!==JSON.stringify(p.p_anterior))return {error:{code:'40001'}};}
  state.writes.push(structuredClone(p));const row={id:p.p_id,colecao:'ativo',registro:structuredClone(p.p_registro)};if(ant)ant.registro=row.registro;else state.rows.push(row);
  return {data:nome==='painel_licitacao_preparar'?{item:structuredClone(row.registro),repetido:false}:structuredClone(row.registro),error:null};
 }};return {db,state};
}
function ambiente({relatorio=pesquisa(),session=sessao,revalidarSessao=async()=>{},b=banco(),clock=()=>agora,consultar}={}){
 const consultas=[];return {...b,consultas,async call(body={...selecao}){try{return await atenderParticipacaoLicitacao({sb:b.db,sessao:session,corpo:body,resposta:(body,status=200)=>({body,status}),quem:'Operador fictício',revalidarSessao,consultar:consultar||(async id=>{consultas.push(id);return structuredClone(relatorio);}),agora:clock});}catch(e){return {status:e.status||500,body:{erro:e.message}};}}};
}
const ficha=async()=> (await montarParticipacao(pesquisa(),selecao,{agora,quem:'Operador fictício'})).ficha;
const linha=(registro,colecao='ativo')=>({id:registro.id,colecao,registro});

test('participação exige sessão e ambas permissões antes de ler o acervo ou o banco',async()=>{
 for(const session of [null,{perms:[]},{perms:['licitacoes']},{perms:['calendario-empresa']}]){const a=ambiente({session}),r=await a.call();assert.ok([401,403].includes(r.status));assert.equal(a.consultas.length,0);assert.equal(a.state.reads.length,0);assert.equal(a.state.writes.length,0);}
});
test('seletores são fechados: cliente não fornece ficha, prazo, origem ou preparo',async()=>{
 for(const patch of [{relatorioId:'../segredo'},{itemId:''},{itemId:'x'.repeat(301)},{itemId:'x\n'},{itemId:1},{item:{}},{preparacaoBot:{}},{prazo:'2099-01-01'},{origemPesquisa:{}}]){const a=ambiente(),r=await a.call({...selecao,...patch});assert.equal(r.status,422);assert.equal(a.state.writes.length,0);assert.equal(a.consultas.length,0);}
});
test('servidor releu a fonte e gera acompanhamento sem inventar valor ou confirmar requisitos',async()=>{
 const a=ambiente(),r=await a.call();assert.equal(r.status,200);assert.deepEqual(a.consultas,[selecao.relatorioId]);assert.equal(r.body.repetido,false);assert.equal(r.body.modo,MODO_PREPARACAO_LICITACAO);const item=r.body.item;
 assert.equal(item.id,await agenda.idAgendamentoLicitacao(agenda.origemDaPesquisa(pesquisa().oportunidades[0],pesquisa(),false)));assert.equal(item.status,'participar');assert.equal(item.validade,'2026-11-04');assert.equal(item.hora,'09:00');assert.equal(item.origemPesquisa.pendente,false);assert.equal(item.preparacaoBot.conferidoPorPessoa,false);assert.equal(item.preparacaoBot.prazoImportado,true);assert.equal(item.preparacaoBot.hash,pesquisa().hash);assert.deepEqual(item.preparacaoBot.exigencias,pesquisa().oportunidades[0].exigencias);assert.equal(item.acompanhamento.checklist.length,6);assert.ok(item.acompanhamento.checklist.every(x=>x.feito===false));assert.equal('valor' in item,false);assert.equal(item.acompanhamento.valorContratado,0);assert.equal(a.state.writes.length,1);assert.match(r.body.avisos.join(' '),/não executa nova pesquisa nem envia proposta/);
});
test('fonte não validada, relatório errado, item retido, repetido ou NO-GO não criam ficha',async()=>{
 const original=pesquisa(),go=original.oportunidades[0];for(const relatorio of [pesquisa({estado:'sem_relatorio'}),pesquisa({id:'outro'}),pesquisa({hash:'x'}),pesquisa({somenteLeitura:false}),pesquisa({origem:'cliente'}),pesquisa({geradoEm:''}),pesquisa({oportunidades:[],retidos:[go]}),pesquisa({oportunidades:[go,go]}),pesquisa({oportunidades:[{...go,classificacao:'NO-GO'}]})]){const a=ambiente({relatorio}),r=await a.call();assert.ok([409,503].includes(r.status));assert.equal(a.state.writes.length,0);}
});
test('REVISÃO HUMANA mantém classificação, requisitos completos e aviso de relatório antigo',async()=>{
 const relatorio=pesquisa();relatorio.antigo=true;const exigencias=Array.from({length:40},(_,i)=>`Exigência fictícia ${i} `+'x'.repeat(305));relatorio.oportunidades[0]={...relatorio.oportunidades[0],classificacao:'REVISÃO HUMANA',exigencias};const r=await ambiente({relatorio}).call();assert.equal(r.status,200);assert.equal(r.body.item.preparacaoBot.classificacao,'REVISÃO HUMANA');assert.deepEqual(r.body.item.preparacaoBot.exigencias,exigencias);assert.equal(r.body.item.acompanhamento.checklist.length,30);assert.ok(r.body.item.acompanhamento.checklist.every(x=>x.texto.length<=300&&!x.feito));assert.match(r.body.avisos.join(' '),/não a transforma em GO/);assert.match(r.body.avisos.join(' '),/relatório está antigo/);assert.match(r.body.avisos.join(' '),/resumos/);
});
test('prazo futuro usa instante exato ou dia Brasília; data ambígua e encerrada não cria',async()=>{
 assert.deepEqual(prazoParticipacao('2026-11-03',agora),{data:'2026-11-03',hora:''});assert.deepEqual(prazoParticipacao('2026-11-03T15:00:01Z',agora),{data:'2026-11-03',hora:'12:00'});assert.deepEqual(prazoParticipacao('2026-11-02',new Date('2026-11-03T01:00:00Z')),{data:'2026-11-02',hora:''});
 for(const prazo of ['2026-11-03T15:00:00Z','2026-11-03T14:59:59Z','2026-11-02','2026-02-30','2026-11-04T10:00:00','amanhã','']){const relatorio=pesquisa();relatorio.oportunidades[0].prazo=prazo;const a=ambiente({relatorio});assert.equal((await a.call()).status,409,prazo);assert.equal(a.state.writes.length,0);}
});
test('repetição e recuperação de resposta perdida preservam ficha completa após vencer o prazo',async()=>{
 const a=ambiente(),r=await a.call(),original=r.body.item;original.status='enviada';original.arquivoNome='Anexo fictício.pdf';original.temArquivo=true;original.acompanhamento.checklist[0].feito=true;original.preparacaoBot.exigencias.push('Preservar revisão anterior');a.state.rows[0].registro=structuredClone(original);
 const b=ambiente({b:a,clock:()=>new Date('2027-01-01T15:00:00Z')}),retry=await b.call();assert.equal(retry.status,200);assert.equal(retry.body.repetido,true);assert.deepEqual(retry.body.item,original);assert.equal(a.state.writes.length,1);
});
test('novo relatório para o mesmo item reutiliza o ID e não altera acompanhamento manual existente',async()=>{
 const original=await ficha();delete original.preparacaoBot;original.status='avaliar';original.validade='2026-12-01';original.observacao='Observação humana';const relatorio=pesquisa({id:'pesquisa-posterior'});relatorio.oportunidades[0].id='id-posterior';const a=ambiente({relatorio});a.state.rows.push(linha(structuredClone(original)));const r=await a.call({relatorioId:relatorio.id,itemId:'id-posterior'});assert.equal(r.status,200);assert.equal(r.body.repetido,true);assert.deepEqual(r.body.item,original);assert.equal(a.state.writes.length,0);
});
test('duas preparações simultâneas resultam numa ficha e num evento de calendário',async()=>{
 const a=ambiente(),rs=await Promise.all([a.call(),a.call()]);assert.deepEqual(rs.map(r=>r.status),[200,200]);assert.deepEqual(rs.map(r=>r.body.repetido).sort(),[false,true]);assert.equal(a.state.writes.length,1);assert.equal(a.state.rows.length,1);assert.equal(agenda.projetarLicitacoesAgenda(a.state.rows.map(r=>r.registro),'2026-11').length,1);
});
for(const code of ['40001','23505'])test('corrida legada '+code+' retorna vencedor canônico sem sobrescrever',async()=>{
 const original=await ficha();original.status='enviada';original.temArquivo=true;original.arquivoNome='Preservar.pdf';original.acompanhamento.checklist[0].feito=true;const b=banco({antesRpc(_n,_p,state){state.rows.push(linha(structuredClone(original)));return {error:{code}};}}),a=ambiente({b}),r=await a.call();assert.equal(r.status,200);assert.equal(r.body.repetido,true);assert.deepEqual(r.body.item,original);assert.equal(a.state.writes.length,0);
});
test('lixeira antes da leitura e surgindo na transação bloqueia ressuscitar a ficha',async()=>{
 const original=await ficha(),a=ambiente();a.state.rows.push(linha(original,'ativo_lixeira'));assert.equal((await a.call()).status,409);assert.equal(a.state.writes.length,0);
 const b=banco({antesRpc(_n,_p,state){state.rows.push(linha(structuredClone(original),'ativo_lixeira'));}}),r=await ambiente({b}).call();assert.equal(r.status,409);assert.equal(b.state.rows.length,1);assert.equal(b.state.writes.length,0);
});
test('identidade conflitante do banco ou do retorno da transação não é exposta nem sobrescrita',async()=>{
 const original=await ficha(),a=ambiente();a.state.rows.push(linha({...original,tipo:'documento',origemPesquisa:undefined,observacao:'SEGREDO'}));const r=await a.call();assert.equal(r.status,409);assert.doesNotMatch(JSON.stringify(r.body),/SEGREDO/);assert.equal(a.state.writes.length,0);
 const b=banco({antesRpc(){return {data:{item:{...original,tipo:'documento',observacao:'SEGREDO'},repetido:true},error:null};}}),rr=await ambiente({b}).call();assert.equal(rr.status,503);assert.doesNotMatch(JSON.stringify(rr.body),/SEGREDO/);
});
test('resposta com ID diferente é recusada mesmo que a origem coincida',async()=>{
 const original=await ficha(),b=banco({antesRpc(){return {data:{item:{...original,id:'outro-id'},repetido:true},error:null};}}),r=await ambiente({b}).call();assert.equal(r.status,503);assert.equal('item' in r.body,false);
});
test('revogação no acervo, antes de gravar e antes da resposta impede a ação ou a exposição',async()=>{
 for(const ponto of [1,2,3,4]){let n=0;const a=ambiente({revalidarSessao:async()=>{if(++n===ponto)throw Object.assign(new Error('Sessão encerrada'),{status:401});}}),r=await a.call();assert.equal(r.status,401);assert.equal(a.state.writes.length,ponto===4?1:0);assert.equal('item' in r.body,false);if(ponto===4){const recovery=await ambiente({b:a}).call();assert.equal(recovery.status,200);assert.equal(recovery.body.repetido,true);assert.equal(a.state.writes.length,1);}}
});
function edge({b=banco(),perms=sessao.perms,jwt,revogado=async()=>false,source=pesquisa()}={}){
 let handler,calls=0;const codigo=readFileSync(new URL('../supabase/functions/painel-ativos/index.ts',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');const sourceFn=async({id})=>{calls++;assert.equal(id,source.id);return structuredClone(source);};
 vm.runInNewContext(transformSync(codigo,{loader:'ts',target:'es2022'}).code,{...acesso,...agenda,atenderParticipacaoLicitacao,consultarPesquisaLicitacoes:sourceFn,Deno:{env:{get:()=> 'teste'},serve:f=>handler=f},createClient:()=>b.db,verificarJwt:jwt||async function(){return {...sessao,perms};},crachaRevogado:revogado,Response,Request,URL,URLSearchParams,TextEncoder,crypto,atob,btoa,Uint8Array,console:{error(){}}});
 return {...b,get calls(){return calls;},async call(corpo,token=true){const r=await handler(new Request('https://test.invalid',{method:'POST',headers:token?{authorization:'Bearer teste'}:{},body:JSON.stringify(corpo)}));return {status:r.status,body:await r.json(),cache:r.headers.get('cache-control')};}};
}
test('endpoint exige autenticação e revalida permissões durante a consulta do acervo',async()=>{
 const request={action:'prepararParticipacaoLicitacao',...selecao};for(const perms of [[],['licitacoes'],['calendario-empresa']]){const a=edge({perms});assert.equal((await a.call(request)).status,403);assert.equal(a.calls,0);}
 assert.equal((await edge().call(request,false)).status,401);let n=0;const a=edge({jwt:async()=>({...sessao,perms:++n>2?['licitacoes']:sessao.perms})});assert.equal((await a.call(request)).status,403);assert.equal(a.state.writes.length,0);
});
test('endpoint usa fonte no servidor, retorna no-store e oculta falha privada do banco',async()=>{
 const source=pesquisa();source.oportunidades[0].prazo='2099-11-04T12:00:00Z';const a=edge({source}),r=await a.call({action:'prepararParticipacaoLicitacao',...selecao});assert.equal(r.status,200);assert.equal(r.cache,'no-store');assert.equal(a.calls,1);assert.equal(r.body.item.preparacaoBot.relatorioId,selecao.relatorioId);
 const b=edge({source,b:banco({errorLeitura:true})}),fail=await b.call({action:'prepararParticipacaoLicitacao',...selecao});assert.equal(fail.status,500);assert.doesNotMatch(JSON.stringify(fail.body),/ERRO-PRIVADO/);
});
test('edição legada preserva metadados e anexo, recusando preparo inventado ou modificado',async()=>{
 const original=await ficha();original.temArquivo=true;original.arquivoNome='Preservar.pdf';original.arquivoKey='somente-teste';const b=banco();b.state.rows.push(linha(structuredClone(original)));const a=edge({b}),r=await a.call({action:'salvar',versao:original.atualizadoEm||'',item:{id:original.id,tipo:'licitacao',nome:'Título revisado',validade:original.validade}});assert.equal(r.status,200);assert.deepEqual(r.body.item.preparacaoBot,original.preparacaoBot);assert.equal(r.body.item.arquivoNome,original.arquivoNome);assert.deepEqual(r.body.item.origemPesquisa,original.origemPesquisa);
 const antes=structuredClone(b.state.rows);const bad=await a.call({action:'salvar',item:{id:original.id,tipo:'licitacao',nome:'Título',preparacaoBot:{...original.preparacaoBot,conferidoPorPessoa:true}}});assert.equal(bad.status,422);assert.deepEqual(b.state.rows,antes);
 const forged=await a.call({action:'salvar',item:{tipo:'licitacao',cadastroId:'manual-ficticia',nome:'Forjada',preparacaoBot:original.preparacaoBot}});assert.equal(forged.status,422);assert.equal(b.state.rows.length,1);
});
test('prévia usa a mesma coleção do acompanhamento, aceita preparo e reutiliza sem duplicar',async()=>{
 const {pesquisaLicitacoesDemo}=await import('../src/review/licitacoes.mjs'),{salvarLicitacaoDemo,listarLicitacoesDemo,agendaLicitacoesDemo}=await import('../src/review/licitacoes-agenda.mjs');const relatorio=await pesquisaLicitacoesDemo(),item=relatorio.oportunidades.find(i=>i.classificacao==='GO'),body={action:'prepararParticipacaoLicitacao',relatorioId:relatorio.id,itemId:item.id};const first=await salvarLicitacaoDemo(body,sessao),r=await first.json();assert.equal(first.status,200);assert.equal(r.item.preparacaoBot.modo,MODO_PREPARACAO_LICITACAO);assert.equal(listarLicitacoesDemo(sessao).filter(i=>i.id===r.item.id).length,1);const retry=await (await salvarLicitacaoDemo(body,sessao)).json();assert.equal(retry.repetido,true);assert.deepEqual(retry.item,r.item);const eventos=await agendaLicitacoesDemo(r.item.validade.slice(0,7),sessao).json();assert.equal(eventos.eventos.filter(e=>e.id==='licitacao:'+r.item.id).length,1);
});

test('Agendar e Participar simultâneos usam criação atômica e devolvem a mesma ficha intacta',async()=>{
 const source=pesquisa();source.oportunidades[0].prazo='2099-11-04T12:00:00Z';const a=edge({source}),original=await ficha(),{id,preparacaoBot,...item}=original;void preparacaoBot;item.status='avaliar';item.nome='Agendamento manual fictício';const [agendado,preparado]=await Promise.all([a.call({action:'salvar',item:{...item,cadastroId:id}}),a.call({action:'prepararParticipacaoLicitacao',...selecao})]);assert.equal(agendado.status,200);assert.equal(preparado.status,200);assert.deepEqual(agendado.body.item,preparado.body.item);assert.equal(a.state.rows.length,1);assert.equal(a.state.writes.length,1);assert.equal('p_colecao' in a.state.writes[0],false);
});
test('Agendar legado não recria ficha retirada durante a gravação; edição mantém CAS normal',async()=>{
 const original=await ficha(),{id,preparacaoBot,...item}=original;void preparacaoBot;const b=banco({antesRpc(_n,_p,state){state.rows.push(linha(structuredClone(original),'ativo_lixeira'));}}),a=edge({b}),r=await a.call({action:'salvar',item:{...item,cadastroId:id}});assert.equal(r.status,409);assert.equal(a.state.rows.length,1);assert.equal(a.state.rows[0].colecao,'ativo_lixeira');assert.equal(a.state.writes.length,0);
 const c=banco();c.state.rows.push(linha(original));const edit=await edge({b:c}).call({action:'salvar',versao:original.atualizadoEm||'',item:{id,tipo:'licitacao',nome:'Edição fictícia',validade:original.validade}});assert.equal(edit.status,200);assert.equal(c.state.writes[0].p_colecao,'ativo');assert.deepEqual(c.state.writes[0].p_anterior,original);
});

test('prévia preserva vencedor de Agendar e Participar em paralelo',async()=>{
 const {pesquisaLicitacoesDemo}=await import('../src/review/licitacoes.mjs'),{salvarLicitacaoDemo,listarLicitacoesDemo}=await import('../src/review/licitacoes-agenda.mjs'),relatorio=await pesquisaLicitacoesDemo(),op=relatorio.oportunidades.find(i=>i.classificacao==='REVISÃO HUMANA'),origem=agenda.origemDaPesquisa(op,relatorio,false),id=await agenda.idAgendamentoLicitacao(origem),prazo=agenda.dataHoraPrazoBrasilia(op.prazo);
 const manual={tipo:'licitacao',cadastroId:id,nome:'Manual simultâneo fictício',status:'avaliar',origemPesquisa:origem,validade:prazo.data,hora:prazo.hora,observacao:'Preservar manual'};const [r1,r2]=await Promise.all([salvarLicitacaoDemo({action:'salvar',item:manual},sessao),salvarLicitacaoDemo({action:'prepararParticipacaoLicitacao',relatorioId:relatorio.id,itemId:op.id},sessao)]);const [a,b]=await Promise.all([r1.json(),r2.json()]);assert.equal(r1.status,200);assert.equal(r2.status,200);assert.deepEqual(a.item,b.item);assert.equal(listarLicitacoesDemo(sessao).filter(i=>i.id===id).length,1);
});
