import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {planejarEtapa} from '../supabase/functions/_shared/processos.mjs';

const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite'))('esbuild');
let pacote;
async function componentes(){
 if(!pacote){
  const r=await build({stdin:{contents:`import React from 'react'; import PlanoEtapas from './components/processos/PlanoEtapas.jsx'; import PainelEtapas from './components/processos/PainelEtapas.jsx'; export {React,PlanoEtapas,PainelEtapas};`,resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'esm',platform:'neutral',jsx:'automatic',conditions:['browser','import','default'],mainFields:['module','main'],loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
  pacote=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
 }
 return pacote;
}
const etapa=extras=>({id:'etapa-ficticia',titulo:'Entrega fictícia',descricao:'Descrição preservada',responsavelRhId:'rh-ficticio',inicioPrevisto:'',prazo:'2020-01-10',inicioReal:'',fimReal:'',situacao:'pendente',progresso:0,dependeDe:[],nota:'',avaliacoes:[{pontuacao:8,comentario:'Conferência fictícia'}],planejadaPor:'Pessoa fictícia',...extras});
const ficha=extras=>({id:'demanda-ficticia',tipo:'demanda',versao:'versao-ficticia',situacao:'execucao',criadoPor:'gestor-ficticio',responsavelRhId:'rh-ficticio',podeGerir:true,podeContribuir:true,envolvidos:[{rhId:'rh-ficticio',nome:'Pessoa fictícia'}],etapas:[etapa()],...extras});
const nos=e=>Array.isArray(e)?e.flatMap(nos):e&&typeof e==='object'?[e,...nos(e.props?.children)]:[];
const texto=e=>Array.isArray(e)?e.map(texto).join(''):e&&typeof e==='object'?texto(e.props?.children):String(e??'');
async function montar(extras={}){
 const c=await componentes(),estados=[],chamadas=[];let indice=0,arvore;
 const props={item:ficha(),externo:false,ocupado:false,executar(...args){chamadas.push(args);return Promise.resolve(true);},...extras};
 const dispatcher={useState(inicial){const i=indice++;if(!(i in estados))estados[i]=typeof inicial==='function'?inicial():inicial;return [estados[i],v=>{estados[i]=typeof v==='function'?v(estados[i]):v;}];}};
 function render(){indice=0;const atual=c.React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher,antes=atual.current;atual.current=dispatcher;try{arvore=c.PlanoEtapas(props);}finally{atual.current=antes;}return arvore;}
 const procurar=fn=>{const n=nos(arvore).find(fn);assert.ok(n,'Controle disponível');return n;};
 const campo=rotulo=>procurar(n=>n.props?.nome===rotulo).props.children;
 function mudar(rotulo,value,evento='onChange'){campo(rotulo).props[evento]?.({target:{value},currentTarget:{value}});render();}
 function clicar(rotulo){procurar(n=>n.type==='button'&&texto(n)===rotulo).props.onClick();render();}
 async function salvar(){procurar(n=>n.type==='form').props.onSubmit({preventDefault(){}});await Promise.resolve();render();return chamadas.at(-1);}
 render();
 return {props,render,campo,procurar,mudar,clicar,salvar,chamadas,get arvore(){return arvore;}};
}

test('input imediato das quatro datas chega ao salvar sem depender de change ou blur',async()=>{
 const item=ficha(),original=structuredClone(item),f=await montar({item});f.clicar('Atualizar etapa e datas');
 const datas={'Início previsto':'2020-01-01','Prazo previsto':'2020-01-15','Início real':'2020-01-02','Término real':'2020-01-09'};
 for(const [rotulo,valor] of Object.entries(datas))f.mudar(rotulo,valor,'onInput');
 f.mudar('Situação da etapa','validacao');
 const [acao,payload]=await f.salvar();assert.equal(acao,'planejarEtapa');assert.equal(f.chamadas[0].length,2);
 for(const [campo,valor] of Object.entries({inicioPrevisto:'2020-01-01',prazo:'2020-01-15',inicioReal:'2020-01-02',fimReal:'2020-01-09'}))assert.equal(payload[campo],valor,campo);
 for(const campo of ['titulo','descricao','responsavelRhId','dependeDe','nota','avaliacoes','planejadaPor'])assert.deepEqual(payload[campo],original.etapas[0][campo],campo);
 assert.equal(payload.etapaId,original.etapas[0].id);assert.equal(payload.progresso,100);assert.deepEqual(item,original);assert.equal(item.versao,'versao-ficticia');
 const salvo=planejarEtapa(item,payload,{sub:'gestor-ficticio',rhId:'rh-ficticio'});
 assert.equal(salvo.etapas[0].inicioReal,'2020-01-02');assert.equal(salvo.etapas[0].fimReal,'2020-01-09');assert.equal(salvo.versao,item.versao);
 assert.ok(!nos(f.arvore).some(n=>n.type==='form'));
});

test('change continua suportado e limpar uma data via input mantém vazio no payload',async()=>{
 const f=await montar();f.clicar('Atualizar etapa e datas');f.mudar('Início previsto','2020-01-01');assert.equal(f.campo('Início previsto').props.value,'2020-01-01');
 f.mudar('Início previsto','','onInput');const [,payload]=await f.salvar();assert.equal(payload.inicioPrevisto,'');
});

test('editar descrição legada sem datas não inventa começo ou término',async()=>{
 const antiga=etapa({situacao:'execucao'});for(const k of ['inicioPrevisto','inicioReal','fimReal','progresso'])delete antiga[k];
 const item=ficha({etapas:[antiga]}),f=await montar({item});f.clicar('Atualizar etapa e datas');f.mudar('O que precisa ser feito','Descrição revista');
 const [,payload]=await f.salvar();assert.equal(payload.inicioReal,'');assert.equal(payload.fimReal,'');
 const salvo=planejarEtapa(item,payload,{sub:'gestor-ficticio',rhId:'rh-ficticio'});
 assert.equal(salvo.etapas[0].descricao,'Descrição revista');for(const k of ['inicioPrevisto','inicioReal','fimReal','progresso'])assert.equal(Object.hasOwn(salvo.etapas[0],k),false,k);
});

test('controles de prazo e datas mantêm restrições do participante e de salvamento',async()=>{
 const f=await montar({item:ficha({podeGerir:false,meuRhId:'rh-ficticio'})});f.clicar('Atualizar etapa e datas');
 assert.equal(f.campo('Início previsto').props.disabled,true);assert.equal(f.campo('Prazo previsto').props.disabled,true);assert.equal(f.campo('Início real').props.disabled,false);assert.equal(f.campo('Término real').props.disabled,false);
 f.props.ocupado=true;f.render();for(const rotulo of ['Início previsto','Prazo previsto','Início real','Término real'])assert.equal(f.campo(rotulo).props.disabled,true);
});

test('indicadores começam recolhidos em Demandas e permanecem diretos em Consultorias',async()=>{
 const {PainelEtapas}=await componentes(),demanda=await montar();
 const detalhes=demanda.procurar(n=>n.type==='details'&&n.props.className==='demanda-indicadores');assert.ok(!detalhes.props.open);assert.ok(nos(detalhes).some(n=>n.type===PainelEtapas));
 const consultoria=await montar({item:ficha({tipo:'consultoria'})});assert.ok(!nos(consultoria.arvore).some(n=>n.props?.className==='demanda-indicadores'));assert.equal(consultoria.arvore.props.children[0].type,PainelEtapas);
});
