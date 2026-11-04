import test from 'node:test';
import assert from 'node:assert/strict';
import {dataHoraPrazoBrasilia,validarOrigemPesquisa,idAgendamentoLicitacao,validarAgendamentoLicitacao,projetarLicitacoesAgenda,caminhoPesquisaAgendada} from '../supabase/functions/_shared/licitacoes-agenda.mjs';
const origem=(patch={})=>({relatorioId:'pesquisa-ficticia',itemId:'item-1',orgao:'Órgão fictício',processo:'Teste 01',item:'Placas',lote:'',pendente:false,...patch});
const ficha=async(patch={})=>({id:await idAgendamentoLicitacao(origem()),tipo:'licitacao',nome:'Sinalização fictícia',status:'avaliar',validade:'2026-11-10',hora:'10:30',origemPesquisa:origem(),acompanhamento:{prazoAcao:'',checklist:[]},...patch});
test('prazo ISO vira Brasília em vez do fuso do aparelho, inclusive virada do mês',()=>{
  assert.deepEqual(dataHoraPrazoBrasilia('2026-11-01T01:30:00Z'),{data:'2026-10-31',hora:'22:30'});
  assert.deepEqual(dataHoraPrazoBrasilia('2026-11-10T10:30:00-03:00'),{data:'2026-11-10',hora:'10:30'});
});
test('pendente nunca assume prazo registrado como data de conferência',()=>assert.deepEqual(dataHoraPrazoBrasilia('2026-11-10T10:30:00-03:00',true),{data:'',hora:''}));
test('prazo ambíguo, inexistente ou sem fuso mantém campos vazios',()=>{
  for(const value of ['2026-11-10','2026-11-10T10:00:00','2026-02-30T10:00:00Z','amanhã',''])assert.deepEqual(dataHoraPrazoBrasilia(value),{data:'',hora:''});
});
test('origem aceita somente identificação pública explícita e campos fechados',()=>{
  for(const patch of [{relatorioId:42},{relatorioId:'../x'},{itemId:''},{orgao:'x\nprivado'},{pendente:'false'},{extra:'nao'}, {itemId:'x'.repeat(301)},{orgao:''}])assert.throws(()=>validarOrigemPesquisa(origem(patch)));
});
test('ID canônico independe de relatório, candidato, caixa e espaços, mas separa item/lote',async()=>{
  const id=await idAgendamentoLicitacao(origem());assert.match(id,/^lic-pesq-[a-f0-9]{64}$/);
  assert.equal(await idAgendamentoLicitacao(origem({relatorioId:'pesquisa-posterior',itemId:'outro',orgao:'  ÓRGÃO  FICTÍCIO ',processo:'teste 01'})),id);
  assert.notEqual(await idAgendamentoLicitacao(origem({item:'Banners'})),id);
  assert.notEqual(await idAgendamentoLicitacao(origem({lote:'2'})),id);
});
test('identificação incompleta de retido usa relatório e candidato, sem unir órgãos desconhecidos',async()=>{
  const o=origem({orgao:'',processo:'',item:'',pendente:true});const id=await idAgendamentoLicitacao(o);
  assert.notEqual(await idAgendamentoLicitacao({...o,itemId:'item-2'}),id);
});
test('confirmação exige data real e hora válida; dia inteiro mantém hora vazia',async()=>{
  const row=await ficha();assert.equal(validarAgendamentoLicitacao({...row,hora:''}).hora,'');
  for(const patch of [{validade:''},{validade:'2026-02-30'},{hora:'24:00'},{hora:'9:00'},{nome:''}])assert.throws(()=>validarAgendamentoLicitacao({...row,...patch}));
});
test('conferência usa próxima ação e não aceita validade comercial',async()=>{
  const row=await ficha({origemPesquisa:origem({pendente:true}),validade:'',acompanhamento:{prazoAcao:'2026-11-05'}});
  assert.equal(validarAgendamentoLicitacao(row).data,'2026-11-05');
  assert.throws(()=>validarAgendamentoLicitacao({...row,validade:'2026-11-10'}));
  assert.throws(()=>validarAgendamentoLicitacao({...row,acompanhamento:{prazoAcao:''}}));
});
test('projeção lê ficha vigente, mês e status; não altera registros nem expõe valores e anexos',async()=>{
  const row=await ficha({valor:999,arquivoNome:'NAO_EXIBIR',observacao:'NAO_EXIBIR'}),antes=structuredClone(row);
  const [event]=projetarLicitacoesAgenda([row,row],'2026-11');assert.equal(event.id,'licitacao:'+row.id);assert.equal(event.tipo,'Licitação');assert.equal(event.hora,'10:30');assert.equal(event.href,'/licitacoes?relatorio=pesquisa-ficticia&item=item-1');assert.equal(JSON.stringify(event).includes('NAO_EXIBIR'),false);assert.equal('valor' in event,false);assert.deepEqual(row,antes);
  for(const status of ['ganha','perdida','fora','cancelado'])assert.deepEqual(projetarLicitacoesAgenda([{...row,status}],'2026-11'),[]);
  assert.deepEqual(projetarLicitacoesAgenda([row],'2026-12'),[]);
  assert.deepEqual(projetarLicitacoesAgenda([{...row,origemPesquisa:undefined}],'2026-11'),[]);
  assert.equal(projetarLicitacoesAgenda([{...row,validade:'2026-12-01'}],'2026-12')[0].id,event.id);
});
test('conferência tem tipo e aviso próprios, com link codificado do item original',async()=>{
  const o=origem({pendente:true,itemId:'id com espaço / ?',relatorioId:'pesquisa:antiga'}),row=await ficha({origemPesquisa:o,validade:'',acompanhamento:{prazoAcao:'2026-11-04'}});
  const [event]=projetarLicitacoesAgenda([row],'2026-11');assert.equal(event.tipo,'Conferência de licitação');assert.match(event.descricao,/ainda precisa ser confirmado/);const url=new URL(caminhoPesquisaAgendada(o),'https://exemplo.invalid');assert.equal(url.searchParams.get('item'),o.itemId);assert.equal(url.searchParams.get('relatorio'),o.relatorioId);
});
test('prazo importado sem conferência humana não aparece como confirmado na agenda',async()=>{
  for(const conferidoPorPessoa of [false,undefined]){
    const row=await ficha({preparacaoBot:{prazoImportado:true,conferidoPorPessoa}}),antes=structuredClone(row);
    const [event]=projetarLicitacoesAgenda([row],'2026-11');
    assert.equal(event.descricao,'Prazo importado da pesquisa; confira edital e retificações.');
    assert.equal(event.data,row.validade);assert.equal(event.hora,row.hora);assert.equal(event.tipo,'Licitação');assert.equal('preparacaoBot' in event,false);assert.deepEqual(row,antes);
  }
  const confirmado=await ficha({preparacaoBot:{prazoImportado:true,conferidoPorPessoa:true}});
  assert.match(projetarLicitacoesAgenda([confirmado],'2026-11')[0].descricao,/Prazo confirmado no acompanhamento/);
  assert.match(projetarLicitacoesAgenda([await ficha()],'2026-11')[0].descricao,/Prazo confirmado no acompanhamento/);
});
test('conferência pendente mantém aviso prioritário mesmo com prazo importado',async()=>{
  const row=await ficha({origemPesquisa:origem({pendente:true}),validade:'',acompanhamento:{prazoAcao:'2026-11-04'},preparacaoBot:{prazoImportado:true,conferidoPorPessoa:false}});
  const [event]=projetarLicitacoesAgenda([row],'2026-11');
  assert.equal(event.tipo,'Conferência de licitação');assert.equal(event.data,'2026-11-04');
  assert.equal(event.descricao,'Conferência de evidências; o prazo da licitação ainda precisa ser confirmado.');
});

import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import * as patrimonio from '../supabase/functions/_shared/patrimonio-acesso.mjs';
function database(){
  const state={rows:[],writes:[],reads:[],race:null,raceCode:'40001',error:null};
  const db={from(table){let fields='',filters=[],lower='',limit=Infinity;
    const q={select(c){fields=c;state.reads.push({table,fields,filters});return q;},eq(k,v){filters.push([k,v]);return q;},gt(k,v){assert.equal(k,'id');lower=v;return q;},order(){return q;},limit(n){limit=n;return q;},range(){return q;},async maybeSingle(){const r=execute();return {...r,data:r.data?.[0]??null};},then(a,b){return Promise.resolve(execute()).then(a,b);}};
    function execute(){
      if(state.error)return {data:null,error:{message:'ERRO_EXTERNO_FICTICIO'}};
      let rows=state.rows.filter(row=>filters.every(([k,v])=>(k==='registro->>tipo'?row.registro.tipo:row[k])===v)&&row.id>lower).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,limit);
      if(fields.startsWith('id,tipo:'))rows=rows.map(r=>({id:r.id,tipo:r.registro.tipo,nome:r.registro.nome,validade:r.registro.validade,hora:r.registro.hora,status:r.registro.status,origemPesquisa:r.registro.origemPesquisa,prazoAcao:r.registro.acompanhamento?.prazoAcao,...(fields.includes('prazoImportado:registro->preparacaoBot->prazoImportado')?{prazoImportado:r.registro.preparacaoBot?.prazoImportado}:{}),...(fields.includes('conferidoPorPessoa:registro->preparacaoBot->conferidoPorPessoa')?{conferidoPorPessoa:r.registro.preparacaoBot?.conferidoPorPessoa}:{})}));
      return {data:structuredClone(rows),error:null};
    }
    return q;
  },async rpc(name,args){
    assert.ok(['painel_registro_gravar','painel_licitacao_preparar'].includes(name));const id=args.p_id,criar=name==='painel_licitacao_preparar',colecao=criar?'ativo':args.p_colecao;
    if(state.race){state.rows.push({id,colecao:'ativo',registro:structuredClone(state.race)});state.race=null;return {data:null,error:{code:state.raceCode,message:'corrida'}};}
    const at=state.rows.findIndex(r=>r.id===id&&r.colecao===colecao),ant=at<0?null:state.rows[at].registro;
    if(criar&&ant)return {data:{item:structuredClone(ant),repetido:true},error:null};
    if(!criar&&JSON.stringify(ant)!==JSON.stringify(args.p_anterior))return {data:null,error:{code:'40001',message:'concorrência'}};
    state.writes.push(structuredClone(args));const row={id,colecao,registro:structuredClone(args.p_registro)};if(at<0)state.rows.push(row);else state.rows[at]=row;return {data:criar?{item:structuredClone(row.registro),repetido:false}:structuredClone(row.registro),error:null};
  }};
  return {db,state};
}
function ambiente({perms=['licitacoes','calendario-empresa'],banco=database(),arquivo='painel-ativos',sessaoFn}={}){
  let handler;
  const source=readFileSync(new URL(`../supabase/functions/${arquivo}/index.ts`,import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
  vm.runInNewContext(transformSync(source,{loader:'ts',target:'es2022'}).code,{
    ...patrimonio,validarOrigemPesquisa,idAgendamentoLicitacao,validarAgendamentoLicitacao,projetarLicitacoesAgenda,
    Deno:{env:{get:()=> 'teste'},serve:fn=>handler=fn},createClient:()=>banco.db,verificarJwt:sessaoFn||async function(){return {sub:'pessoa-ficticia',perms};},crachaRevogado:async()=>false,
    Response,Request,URL,URLSearchParams,TextEncoder,crypto,atob,btoa,Uint8Array,console:{error(){}},
  });
  return {...banco,call:async body=>{const r=await handler(new Request('https://exemplo.invalid',{method:'POST',headers:{authorization:'Bearer teste'},body:JSON.stringify(body)}));return {status:r.status,body:await r.json()};}};
}
async function novo(patch={}){const r=await ficha(patch);const {id,...resto}=r;return {...resto,cadastroId:id};}
test('handler salva e relê uma única ficha persistida; repetição de relatório novo não sobrescreve',async()=>{
  const a=ambiente(),item=await novo(),first=await a.call({action:'salvar',item});assert.equal(first.status,200);assert.equal(first.body.item.id,item.cadastroId);assert.equal(a.state.writes.length,1);
  const segundo=await a.call({action:'salvar',item:{...item,nome:'NÃO SOBRESCREVER',validade:'2026-11-20',origemPesquisa:{...item.origemPesquisa,relatorioId:'pesquisa-posterior',itemId:'outro'}}});assert.equal(segundo.status,200);assert.equal(segundo.body.repetido,true);assert.equal(segundo.body.item.nome,first.body.item.nome);assert.equal(segundo.body.item.validade,first.body.item.validade);assert.equal(a.state.writes.length,1);
  const reiniciado=ambiente({banco:a}),leitura=await reiniciado.call({action:'listar'});assert.equal(leitura.status,200);assert.equal(leitura.body.itens.length,1);assert.equal(leitura.body.itens[0].origemPesquisa.relatorioId,'pesquisa-ficticia');
});
for(const code of ['40001','23505'])test('duas criações simultâneas retornam vencedor sem apagar o histórico: '+code,async()=>{
  const a=ambiente(),item=await novo(),vencedor=await ficha({nome:'Salvo por outra sessão',arquivoNome:'Anexo fictício.pdf',temArquivo:true,acompanhamento:{prazoAcao:'',checklist:[{id:'x',texto:'Preservar',feito:true}]}});a.state.race=vencedor;a.state.raceCode=code;
  const r=await a.call({action:'salvar',item});assert.equal(r.status,200);assert.equal(r.body.repetido,true);assert.equal(r.body.item.nome,vencedor.nome);assert.equal(r.body.item.arquivoNome,vencedor.arquivoNome);assert.equal(r.body.item.acompanhamento.checklist[0].feito,true);assert.equal(a.state.writes.length,0);assert.equal(a.state.rows.length,1);
});
test('criar calendário exige ambas permissões e não grava sem elas',async()=>{
  for(const perms of [[],['licitacoes'],['calendario-empresa']]){const a=ambiente({perms}),r=await a.call({action:'salvar',item:await novo()});assert.equal(r.status,403);assert.equal(a.state.writes.length,0);}
});
test('edição omitir origem não contorna permissão de calendário nem perde vínculo',async()=>{
  const original=await ficha(),banco=database();banco.state.rows.push({id:original.id,colecao:'ativo',registro:original});
  const negado=ambiente({perms:['licitacoes'],banco});assert.equal((await negado.call({action:'salvar',item:{id:original.id,tipo:'licitacao',nome:original.nome,validade:'2026-12-01'}})).status,403);
  const autorizado=ambiente({banco}),r=await autorizado.call({action:'salvar',versao:original.atualizadoEm||'',item:{id:original.id,tipo:'licitacao',nome:original.nome,validade:'2026-12-01'}});assert.equal(r.status,200);assert.deepEqual(r.body.item.origemPesquisa,original.origemPesquisa);assert.equal(r.body.item.validade,'2026-12-01');
});
test('edição não pode trocar relatório de origem nem cadastrar data inexistente',async()=>{
  const a=ambiente(),item=await novo();await a.call({action:'salvar',item});
  const {cadastroId,...resto}=item;assert.equal((await a.call({action:'salvar',item:{...resto,id:cadastroId,origemPesquisa:{...resto.origemPesquisa,relatorioId:'outro'}}})).status,409);
  assert.equal((await a.call({action:'salvar',versao:a.state.rows[0].registro.atualizadoEm,item:{id:cadastroId,tipo:'licitacao',nome:item.nome,validade:'2026-02-30'}})).status,422);assert.equal(a.state.writes.length,1);
});
test('identificador divergente, origem extra e horário inválido são recusados antes de escrever',async()=>{
  for(const patch of [{cadastroId:'id-manual'},{hora:'24:01'},{origemPesquisa:origem({extra:true})}]){const a=ambiente();assert.equal((await a.call({action:'salvar',item:{...await novo(),...patch}})).status,422);assert.equal(a.state.writes.length,0);}
});
test('licitação manual mantém contrato anterior sem precisar calendário e sem origem nova',async()=>{
  const a=ambiente({perms:['licitacoes']}),r=await a.call({action:'salvar',item:{tipo:'licitacao',cadastroId:'manual-ficticia',nome:'Manual fictícia',validade:'',hora:''}});assert.equal(r.status,200);assert.equal('origemPesquisa' in r.body.item,false);
});
test('conferência pendente persistida não ganha validade de edital',async()=>{
  const item=await novo({origemPesquisa:origem({pendente:true}),validade:'',acompanhamento:{prazoAcao:'2026-11-04'}}),a=ambiente();assert.equal((await a.call({action:'salvar',item})).status,200);assert.equal(a.state.rows[0].registro.validade,'');
  const r=await a.call({action:'salvar',versao:a.state.rows[0].registro.atualizadoEm,item:{id:item.cadastroId,tipo:'licitacao',nome:item.nome,validade:'2026-12-01'}});assert.equal(r.status,422);assert.equal(a.state.writes.length,1);
});
test('calendário exige ambas permissões antes da consulta',async()=>{
  for(const perms of [[],['licitacoes'],['calendario-empresa']]){const a=ambiente({perms,arquivo:'painel-agenda'}),r=await a.call({action:'licitacoes',mes:'2026-11'});assert.equal(r.status,403);assert.equal(a.state.reads.length,0);}
});
test('calendário projeta registros persistidos com consulta mínima e devolve link completo',async()=>{
  const banco=database(),row=await ficha();banco.state.rows.push({id:row.id,colecao:'ativo',registro:row});
  const a=ambiente({banco,arquivo:'painel-agenda'}),r=await a.call({action:'licitacoes',mes:'2026-11'});assert.equal(r.status,200);assert.equal(r.body.eventos.length,1);assert.match(r.body.eventos[0].href,/relatorio=pesquisa-ficticia&item=item-1/);assert.equal(a.state.writes.length,0);
  const consulta=a.state.reads[0];assert.ok(consulta.filters.some(([k,v])=>k==='registro->>tipo'&&v==='licitacao'));assert.equal(consulta.fields.includes('valor'),false);assert.equal(consulta.fields.includes('arquivo'),false);assert.equal(consulta.fields.includes('registro,'),false);
});
test('endpoint da agenda lê somente os dois indicadores do bot e não confirma prazo importado',async()=>{
  const banco=database(),row=await ficha({preparacaoBot:{prazoImportado:true,conferidoPorPessoa:false,anexo:'NAO_EXIBIR_BOT',observacao:'NAO_EXIBIR_BOT'},valor:900,observacao:'NAO_EXIBIR_FICHA'});
  banco.state.rows.push({id:row.id,colecao:'ativo',registro:row});const antes=structuredClone(banco.state.rows);
  const a=ambiente({banco,arquivo:'painel-agenda'}),r=await a.call({action:'licitacoes',mes:'2026-11'});
  assert.equal(r.status,200);assert.equal(r.body.eventos[0].descricao,'Prazo importado da pesquisa; confira edital e retificações.');
  assert.doesNotMatch(JSON.stringify(r.body),/NAO_EXIBIR|preparacaoBot|prazoImportado|conferidoPorPessoa/);
  const consulta=a.state.reads[0].fields;
  assert.ok(consulta.includes('prazoImportado:registro->preparacaoBot->prazoImportado'));
  assert.ok(consulta.includes('conferidoPorPessoa:registro->preparacaoBot->conferidoPorPessoa'));
  assert.equal(consulta.includes('preparacaoBot:registro->preparacaoBot'),false);
  assert.doesNotMatch(consulta,/valor|observacao|arquivo|anexo/);
  assert.equal(a.state.writes.length,0);assert.deepEqual(banco.state.rows,antes);
});
test('revogação após leitura ou falha de banco não entrega agenda falsa vazia',async()=>{
  let n=0;const a=ambiente({arquivo:'painel-agenda',sessaoFn:async()=>({sub:'teste',perms:++n>2?[]:['licitacoes','calendario-empresa']})});assert.equal((await a.call({action:'licitacoes',mes:'2026-11'})).status,403);
  const b=ambiente({arquivo:'painel-agenda'});b.state.error=true;const r=await b.call({action:'licitacoes',mes:'2026-11'});assert.equal(r.status,500);assert.equal('eventos' in r.body,false);assert.equal(JSON.stringify(r.body).includes('ERRO_EXTERNO_FICTICIO'),false);
});
