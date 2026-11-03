import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import {combinarEventosCalendario,destinoEventoCalendario} from '../supabase/functions/_shared/documentos-agenda.mjs';

const source=readFileSync(new URL('../src/pages/CalendarioEmpresa.jsx',import.meta.url),'utf8').replace(/^import[\s\S]*?;\s*$/gm,'');
const code=transformSync(source,{loader:'jsx',format:'cjs',jsx:'automatic',target:'es2022'}).code;
const jsx=(type,props,key)=>({type:typeof type==='function'?type.name:type,props,key});
const stub=name=>Object.defineProperty(()=>null,'name',{value:name});
const uiSource=readFileSync(new URL('../src/components/ui.jsx',import.meta.url),'utf8');
const uiCode=transformSync(uiSource.slice(uiSource.indexOf('export function AvisoAtualizacao'),uiSource.indexOf('export { TOM }')),{loader:'jsx',format:'cjs',jsx:'automatic',target:'es2022'}).code;
const uiContext={module:{exports:{}},require:()=>({jsx,jsxs:jsx})};
vm.runInNewContext(uiCode,uiContext);
const AvisoAtualizacao=uiContext.module.exports.AvisoAtualizacao;
const sessao={usuario:'pessoa-ficticia',master:false,permissoes:['calendario-empresa','campanhas']};
const evento={id:'campanha:exemplo:acao',origem:'campanhas',titulo:'AÇÃO FICTÍCIA DE CAMPANHA',data:'2026-11-10',hora:'',tipo:'Campanha',cor:'#6d28d9',href:'/campanhas?campanha=exemplo'};
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const allNodes=node=>!node||typeof node!=='object'?[]:[node,...Object.values(node).flatMap(allNodes)];
const text=node=>JSON.stringify(node);
const campaignWarning=tree=>allNodes(tree).find(node=>node.type==='AvisoAtualizacao'&&/campanhas/i.test(node.props?.erro||''));

// Real page, controlled hooks and deferred network responses. No browser, data
// store or production service is contacted; response order is explicit.
function mount(){
  const hooks=[],effects=[],requests=[];let cursor=0,month='2026-11',currentSession=sessao;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
  const useState=initial=>{const i=cursor++;if(!(i in hooks))hooks[i]={value:typeof initial==='function'?initial():initial};return [hooks[i].value,value=>{hooks[i].value=typeof value==='function'?value(hooks[i].value):value;}];};
  const useRef=initial=>{const i=cursor++;return hooks[i]??(hooks[i]={current:initial});};
  const useCallback=(fn,deps)=>{const i=cursor++;if(!same(hooks[i]?.deps,deps))hooks[i]={deps,fn};return hooks[i].fn;};
  const useMemo=(fn,deps)=>{const i=cursor++;if(!same(hooks[i]?.deps,deps))hooks[i]={deps,value:fn()};return hooks[i].value;};
  const useEffect=(fn,deps)=>{const i=cursor++,before=hooks[i];if(!same(before?.deps,deps)){hooks[i]={deps,cleanup:before?.cleanup};effects.push(()=>{hooks[i].cleanup?.();hooks[i].cleanup=fn();});}};
  const context={module:{exports:{}},require:()=>({jsx,jsxs:jsx}),useState,useRef,useCallback,useMemo,useEffect,
    useMesCalendario:()=>[month,value=>{month=typeof value==='function'?value(month):value;}],
    combinarEventosCalendario,destinoDocumento:destinoEventoCalendario,
    podeAbrir:(name,s)=>!!s&&(s.master||s.permissoes?.includes('*')||s.permissoes?.includes(name)),
    lerEmpresa:async()=>({eventos:[],hoje:'2026-11-03'}),
    lerAgendaCampanhas:mes=>new Promise((resolve,reject)=>requests.push({mes,resolve,reject})),
    lerAgendaReunioes:async()=>[],lerAgendaProcessos:async()=>[],lerAgendaPatrimonio:async()=>[],lerAgendaDocumentos:async()=>[],lerAgendaComercial:async()=>({eventos:[]}),lerAgendaLicitacoes:async()=>[],
    window:{addEventListener(){},removeEventListener(){}}};
  for(const name of ['PageTitle','Card','Empty','CarregandoModulo','ErroModulo','AvisoAtualizacao','ChevronLeft','ChevronRight','RefreshCw','Eye','CalendarDays','Link'])context[name]=stub(name);
  vm.runInNewContext(code,context);
  const t={requests,render(nextSession=currentSession,{effects:run=true}={}){currentSession=nextSession;cursor=0;const tree=context.module.exports.default({sessao:currentSession});if(run)t.effects();return tree;},effects(){for(const fn of effects.splice(0))fn();},month(value){month=value;},reload(){const title=allNodes(t.render()).find(n=>n.type==='PageTitle');assert.ok(title);return title.props.acao.props.onClick();}};
  return t;
}
async function loaded(){const t=mount();t.render();t.requests[0].resolve([evento]);await flush();assert.match(text(t.render()),/AÇÃO FICTÍCIA DE CAMPANHA/);return t;}

test('Campanhas preserva consulta válida da mesma sessão e mês após falha transitória',async()=>{
  const t=await loaded(),done=t.reload();t.requests[1].reject(Object.assign(new Error('Falha fictícia'),{status:500}));await done;
  const tree=t.render(),warning=campaignWarning(tree);assert.match(text(tree),/AÇÃO FICTÍCIA DE CAMPANHA/);assert.ok(warning);
  assert.match(text(AvisoAtualizacao(warning.props)),/A última leitura continua visível/);
});
test('primeira falha de Campanhas não afirma consulta anterior nem ausência comprovada de ações',async()=>{
  const t=mount();t.render();t.requests[0].reject(Object.assign(new Error('Falha fictícia'),{status:500}));await flush();
  const tree=t.render(),warning=campaignWarning(tree);assert.ok(warning);const result=text(AvisoAtualizacao(warning.props));
  assert.match(result,/Não há leitura válida de Campanhas disponível para este mês/);
  assert.doesNotMatch(result,/A última leitura continua visível/);
  assert.doesNotMatch(text(tree),/Nenhum evento ou reunião lançado neste mês/);
  assert.match(text(tree),/ações de Campanhas ainda não puderam ser conferidas/);
});
for(const status of [401,403])test(`recusa ${status} descarta consulta anterior de Campanhas`,async()=>{
  const t=await loaded(),done=t.reload();t.requests[1].reject(Object.assign(new Error('Acesso recusado'),{status}));await done;
  const tree=t.render(),warning=campaignWarning(tree);assert.doesNotMatch(text(tree),/AÇÃO FICTÍCIA DE CAMPANHA/);assert.ok(warning);
  assert.doesNotMatch(text(AvisoAtualizacao(warning.props)),/A última leitura continua visível/);
});
test('mês diferente não usa cache nem aviso do mês anterior, mesmo antes dos efeitos',async()=>{
  const t=await loaded(),done=t.reload();t.requests[1].reject(new Error('Falha fictícia'));await done;
  t.month('2026-12');const before=t.render(sessao,{effects:false});assert.doesNotMatch(text(before),/AÇÃO FICTÍCIA DE CAMPANHA/);assert.equal(campaignWarning(before),undefined);
  t.effects();t.requests[2].reject(new Error('Falha de dezembro'));await flush();const tree=t.render();assert.doesNotMatch(text(tree),/AÇÃO FICTÍCIA DE CAMPANHA/);assert.match(text(AvisoAtualizacao(campaignWarning(tree).props)),/Não há leitura válida/);
});
test('troca de usuário ou perda de permissão oculta Campanhas imediatamente',async()=>{
  for(const next of [{...sessao,usuario:'outra-pessoa'},{...sessao,permissoes:['calendario-empresa']},null]){
    const t=await loaded();const tree=t.render(next,{effects:false});assert.doesNotMatch(text(tree),/AÇÃO FICTÍCIA DE CAMPANHA/);assert.equal(campaignWarning(tree),undefined);
    t.effects();if(!next?.permissoes.includes('campanhas'))assert.equal(t.requests.length,1);
  }
});
test('resposta antiga de Campanhas não substitui consulta do novo mês',async()=>{
  const t=mount();t.render();t.month('2026-12');t.render();t.requests[1].resolve([{...evento,id:'dezembro',data:'2026-12-10',titulo:'AÇÃO FICTÍCIA DE DEZEMBRO'}]);await flush();
  t.requests[0].resolve([evento]);await flush();const tree=t.render();assert.match(text(tree),/AÇÃO FICTÍCIA DE DEZEMBRO/);assert.doesNotMatch(text(tree),/AÇÃO FICTÍCIA DE CAMPANHA/);
});
test('resposta válida vazia substitui cache anterior e limpa o erro',async()=>{
  const t=await loaded(),done=t.reload();t.requests[1].resolve([]);await done;const tree=t.render();assert.doesNotMatch(text(tree),/AÇÃO FICTÍCIA DE CAMPANHA/);assert.equal(campaignWarning(tree),undefined);
});
for(const scenario of ['acesso recusado','primeira falha no mês'])test(`filtro Campanha não transforma ${scenario} em ausência de ações`,async()=>{
  const t=await loaded(),filter=allNodes(t.render()).find(node=>node.type==='button'&&node.props?.['aria-pressed']===false&&text(node).includes('"Campanha"'));
  assert.ok(filter);filter.props.onClick();
  if(scenario==='acesso recusado'){const done=t.reload();t.requests[1].reject(Object.assign(new Error('Acesso recusado'),{status:403}));await done;}
  else {t.month('2026-12');t.render();t.requests[1].reject(Object.assign(new Error('Falha transitória'),{status:500}));await flush();}
  const tree=t.render();assert.match(text(tree),/ações de Campanhas ainda não puderam ser conferidas/);assert.doesNotMatch(text(tree),/Nenhum evento do tipo/);
});
test('AvisoAtualizacao mantém contrato anterior por padrão e permite mensagem honesta sem cache',()=>{
  assert.match(text(AvisoAtualizacao({erro:'Falha fictícia'})),/A última leitura continua visível/);
  assert.doesNotMatch(text(AvisoAtualizacao({erro:'Falha fictícia',leituraAnterior:false})),/A última leitura continua visível/);
});
test('serviço Campanhas preserva status HTTP e recusa resposta incompleta',async()=>{
  function service(response){
    const source=readFileSync(new URL('../src/services/agenda.js',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
    const context={module:{exports:{}},API:'https://teste.invalid',comCracha:async()=>response,mensagemDoStatus:s=>`Falha ${s}`};
    vm.runInNewContext(transformSync(source,{format:'cjs',target:'es2022'}).code,context);return context.module.exports.lerAgendaCampanhas;
  }
  for(const status of [401,403,500])await assert.rejects(service({ok:false,status,json:async()=>({erro:'Falha fictícia'})})('2026-11'),error=>error.status===status);
  for(const data of [null,{}, {eventos:null}])await assert.rejects(service({ok:true,json:async()=>data})('2026-11'),/Resposta inválida/);
});
