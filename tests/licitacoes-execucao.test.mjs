import test from 'node:test';
import assert from 'node:assert/strict';
import {processarExecucaoLicitacoes} from '../supabase/functions/_shared/licitacoes-execucao.mjs';

const AGORA='2026-01-15T12:00:00.000Z';
const ID='00000000-0000-4000-8000-000000000001';
function execucao(overrides={}) {
  return {id:123,head_branch:'main',status:'completed',conclusion:'success',display_title:'Pesquisa licitações · anterior',created_at:'2026-01-15T10:00:00Z',updated_at:'2026-01-15T10:02:00Z',html_url:'https://nao-confiar.example/run',...overrides};
}
function ambiente({runs=[],registro=null,consultaStatus=200,dispatchStatus=204,token='segredo-ficticio',autorizar=async()=>{}}={}) {
  let salvo=registro,versao=0;const chamadas=[];
  const meta={
    async ler(){return salvo?structuredClone({...salvo,atualizado_em:String(versao)}):null;},
    async reservar(anterior,valor){if((anterior?.atualizado_em??null)!==(salvo?String(versao):null))return false;salvo={valor:structuredClone(valor)};versao++;return true;},
    async registrar(reserva,valor){if(salvo?.valor?.solicitacaoId!==reserva.solicitacaoId)return false;salvo={valor:structuredClone(valor)};versao++;return true;},
  };
  const fetcher=async(url,options={})=>{
    chamadas.push({url,options});const u=new URL(url);
    if(options.method==='POST')return new Response(null,{status:dispatchStatus});
    if(consultaStatus!==200)return new Response(null,{status:consultaStatus});
    const filtro=u.searchParams.get('status');const escolhidos=runs.filter(r=>!filtro||r.status===filtro);
    return Response.json({total_count:escolhidos.length,workflow_runs:escolhidos});
  };
  return {chamadas,get salvo(){return salvo?.valor;},chamar:(method='GET',extra={})=>processarExecucaoLicitacoes({method,token,repo:'empresa-exemplo/painel-exemplo',fetcher,meta,confirmarAcesso:autorizar,agora:()=>new Date(AGORA),novoId:()=>ID,...extra})};
}

test('sem token recusa com erro honesto antes de consultar ou disparar GitHub',async()=>{
  const a=ambiente({token:''});await assert.rejects(a.chamar('POST'),e=>e.status===503&&/não.*configurado/i.test(e.message));assert.equal(a.chamadas.length,0);
});
test('status concluída depende de execução real bem-sucedida e URL é construída no repositório fixo',async()=>{
  const a=ambiente({runs:[execucao()]});const r=await a.chamar();
  assert.equal(r.estado,'concluida');assert.equal(r.execucao.id,123);assert.equal(r.execucao.url,'https://github.com/empresa-exemplo/painel-exemplo/actions/runs/123');assert.equal(r.consultadoEm,AGORA);assert.doesNotMatch(JSON.stringify(r),/segredo-ficticio|nao-confiar/);
});
test('execução ativa é reutilizada antes do dispatch mesmo com registro antigo',async()=>{
  const a=ambiente({runs:[execucao({status:'in_progress',conclusion:null})]});const r=await a.chamar('POST');
  assert.equal(r.estado,'em_andamento');assert.equal(r.execucao.id,123);assert.equal(a.chamadas.filter(c=>c.options.method==='POST').length,0);assert.equal(a.salvo,undefined);
});
test('dispatch aceito registra solicitação sem inventar run ou conclusão',async()=>{
  const a=ambiente();const r=await a.chamar('POST');
  assert.equal(r.estado,'solicitada');assert.equal(r.execucao,null);assert.equal(r.solicitadaEm,AGORA);assert.equal(a.salvo.estado,'solicitada');
  const disparo=a.chamadas.find(c=>c.options.method==='POST');assert.deepEqual(JSON.parse(disparo.options.body),{ref:'main',inputs:{solicitacao_id:ID}});
});
test('pedidos simultâneos compartilham reserva e apenas um dispatch é emitido',async()=>{
  const a=ambiente();const r=await Promise.all([a.chamar('POST'),a.chamar('POST')]);
  assert.ok(r.every(x=>x.estado==='solicitada'));assert.equal(a.chamadas.filter(c=>c.options.method==='POST').length,1);
});
test('cooldown mantém solicitação recente sem associar sucesso de execução anterior',async()=>{
  const a=ambiente({registro:{valor:{estado:'solicitada',em:'2026-01-15T11:59:00.000Z',solicitacaoId:ID}},runs:[execucao()]});
  const r=await a.chamar('POST');assert.equal(r.estado,'solicitada');assert.equal(r.execucao,null);assert.equal(a.chamadas.filter(c=>c.options.method==='POST').length,0);
});
test('run com identificador da solicitação confirma a execução correta',async()=>{
  const a=ambiente({registro:{valor:{estado:'solicitada',em:'2026-01-15T11:50:00.000Z',solicitacaoId:ID}},runs:[execucao({id:456,display_title:`Pesquisa licitações · ${ID}`,created_at:'2026-01-15T11:51:00Z'})]});
  const r=await a.chamar();assert.equal(r.estado,'concluida');assert.equal(r.execucao.id,456);
});
test('workflow ausente não é apresentado como pesquisa solicitada',async()=>{
  const a=ambiente({consultaStatus:404});await assert.rejects(a.chamar('POST'),e=>e.status===503&&/workflow.*não.*disponível/i.test(e.message));assert.equal(a.salvo,undefined);
});
test('dispatch recusado registra falha e não devolve solicitação bem-sucedida',async()=>{
  const a=ambiente({dispatchStatus:403});await assert.rejects(a.chamar('POST'),e=>e.status===503&&/recusou/i.test(e.message));assert.equal(a.salvo.estado,'falhou');
});
test('revogação durante as leituras impede reservar ou disparar',async()=>{
  let checks=0;const a=ambiente({autorizar:async()=>{if(++checks>1)throw Object.assign(Error('Sessão revogada'),{status:401});}});
  await assert.rejects(a.chamar('POST'),e=>e.status===401);assert.equal(a.salvo,undefined);assert.equal(a.chamadas.filter(c=>c.options.method==='POST').length,0);
});
test('revogação depois da reserva ainda impede o dispatch',async()=>{
  let checks=0;const a=ambiente({autorizar:async()=>{if(++checks>2)throw Object.assign(Error('Sessão revogada'),{status:401});}});
  await assert.rejects(a.chamar('POST'),e=>e.status===401);assert.equal(a.chamadas.filter(c=>c.options.method==='POST').length,0);
});
test('execução cancelada é falha técnica e não é convertida em cobertura concluída',async()=>{
  const a=ambiente({runs:[execucao({conclusion:'cancelled'})]});const r=await a.chamar();assert.equal(r.estado,'falhou');assert.match(r.erro,/cancelled/);assert.equal(r.cobertura,undefined);
});
test('sem execução conhecida retorna estado vazio sem fabricar datas ou run',async()=>{
  const r=await ambiente().chamar();assert.equal(r.estado,'sem_execucao');assert.equal(r.execucao,null);assert.equal(r.solicitadaEm,null);
});
test('corpo HTTP é lido antes de abortar o transporte ao encerrar a consulta',async()=>{
  const fetcher=async(url,options)=>{
    const status=new URL(url).searchParams.get('status');const bytes=new TextEncoder().encode(JSON.stringify({workflow_runs:status?[]:[execucao()]}));
    return new Response(new ReadableStream({start(controller){const timer=setTimeout(()=>{controller.enqueue(bytes);controller.close();},2);options.signal.addEventListener('abort',()=>{clearTimeout(timer);try{controller.error(Error('corpo abortado'));}catch{}});}}));
  };
  const r=await ambiente().chamar('GET',{fetcher});assert.equal(r.estado,'concluida');
});
test('timeout não transforma resposta ausente em execução iniciada',async()=>{
 const a=ambiente();await assert.rejects(a.chamar('POST',{fetcher:()=>new Promise(()=>{}),timeoutMs:2}),e=>e.status===503&&/tempo/.test(e.message));assert.equal(a.salvo,undefined);
});
test('revogação após dispatch impede entrega da resposta e gravação posterior',async()=>{
 let checks=0;const a=ambiente({autorizar:async()=>{if(++checks>3)throw Object.assign(Error('Sessão revogada'),{status:401});}});
 await assert.rejects(a.chamar('POST'),e=>e.status===401);assert.equal(a.chamadas.filter(c=>c.options.method==='POST').length,1);assert.equal(a.salvo.estado,'reservada');
});
test('solicitação sem run identificada pode ser repetida após cooldown sem inventar falha da execução',async()=>{
 const a=ambiente({registro:{valor:{estado:'solicitada',em:'2026-01-15T11:49:00.000Z',solicitacaoId:ID}}});
 const r=await a.chamar();assert.equal(r.estado,'solicitada');assert.equal(r.podeRepetir,true);assert.equal(r.execucao,null);
});
