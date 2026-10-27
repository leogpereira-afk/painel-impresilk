import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite'))('esbuild');
const compilado=await build({stdin:{contents:`import React from 'react';import Acesso from './components/processos/AcessoConsultoria.jsx';import Portal from './pages/ColaborarProcesso.jsx';export {React,Acesso,Portal};`,resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'esm',platform:'neutral',jsx:'automatic',conditions:['browser','import','default'],mainFields:['module','main'],loader:{'.css':'empty'},define:{'import.meta.env':'{"MODE":"test","BASE_URL":"/"}','process.env.NODE_ENV':'"production"'},logLevel:'silent'});
const {React,Acesso,Portal}=await import('data:text/javascript;base64,'+Buffer.from(compilado.outputFiles[0].text).toString('base64'));
const nos=e=>Array.isArray(e)?e.flatMap(nos):e&&typeof e==='object'?[e,...nos(e.props?.children)]:[];
const texto=e=>Array.isArray(e)?e.map(texto).join(''):e&&typeof e==='object'?texto(e.props?.children):String(e??'');
const item=()=>({id:'exemplo',tipo:'consultoria',situacao:'execucao',anexos:[],consultores:[{id:'pessoa',nome:'Pessoa fictícia'}],convites:[{id:'c1',consultorId:'pessoa',nivel:'colaborador',nome:'Pessoa fictícia',semValidade:true,expiraEm:null}]});
function montar(Componente,props){let arvore,indice=0;const estados=[],effects=[];const dispatcher={useState(inicial){const i=indice++;if(!(i in estados))estados[i]=typeof inicial==='function'?inicial():inicial;return [estados[i],v=>{estados[i]=typeof v==='function'?v(estados[i]):v;}];},useEffect(fn){effects.push(fn);}};function render(){indice=0;const current=React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher,antes=current.current;current.current=dispatcher;try{arvore=Componente(props);}finally{current.current=antes;}return arvore;}const button=n=>{const b=nos(arvore).find(x=>x.type==='button'&&texto(x).trim()===n);assert.ok(b,n);return b;};render();return {render,button,effects,estados,get arvore(){return arvore;}};}
const evento={preventDefault(){}};
test('criação explícita sem vencimento e troca para prazo finito enviam contratos diferentes',async()=>{
 const chamadas=[],props={item:item(),executar:async(...a)=>{chamadas.push(a);return true;},limparLink(){}};
 const m=montar(Acesso,props);assert.match(texto(m.arvore),/Sem vencimento · revogável/);
 m.button('Gerar novo acesso').props.onClick();m.render();assert.equal(m.button('Sem vencimento').props['aria-pressed'],true);
 assert.equal(nos(m.arvore).some(n=>n.type==='input'&&n.props.type==='number'),false);
 nos(m.arvore).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});m.render();
 await nos(m.arvore).find(n=>n.type==='form').props.onSubmit(evento);assert.deepEqual(chamadas[0],['convidar',{consultorId:'pessoa',semValidade:true,nivel:'colaborador'}]);
 m.render();m.button('Alterar validade').props.onClick();m.render();m.button('Com prazo').props.onClick();m.render();m.button('30 dias').props.onClick();m.render();
 nos(m.arvore).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});m.render();await nos(m.arvore).find(n=>n.type==='form').props.onSubmit(evento);
 assert.deepEqual(chamadas[1],['renovarConvite',{conviteId:'c1',dias:30,semValidade:false}]);
});
test('falha preserva formulário e administrador externo não pode conceder administração',async()=>{
 const m=montar(Acesso,{item:item(),externo:true,executar:async()=>false,limparLink(){}});m.button('Gerar novo acesso').props.onClick();m.render();
 assert.equal(nos(m.arvore).filter(n=>n.type==='input'&&n.props.type==='radio').some(n=>n.props.value==='administrador'),false);
 nos(m.arvore).find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});m.render();await nos(m.arvore).find(n=>n.type==='form').props.onSubmit(evento);m.render();
 assert.ok(nos(m.arvore).some(n=>n.type==='form'));assert.match(texto(m.arvore),/sujeitos à validade e à revogação/);
});
test('link permanente limitado pelo convite pai mostra o limite efetivo',()=>{
 const i=item();i.convites[0].limiteExpiraEm='2099-10-20T15:00:00Z';i.convites[0].paiId='pai';i.convites[0].estadoAcesso='ativo';const m=montar(Acesso,{item:i,limparLink(){}});
 assert.match(texto(m.arvore),/Até 20\/10\/2099/);assert.doesNotMatch(texto(m.arvore),/Sem vencimento · revogável/);
});
test('portal conserva convite no fragmento após montagem e reinicializa a partir dele',async()=>{
 const anterior=globalThis.window,fetchAnterior=globalThis.fetch;const hash='#convite=exemplo.'+'a'.repeat(64),listeners={};let limpeza=0;
 globalThis.window={location:{hash,pathname:'/colaborar',search:''},history:{replaceState(){limpeza++;}},addEventListener(t,f){listeners[t]=f;},removeEventListener(){}};
 globalThis.fetch=async()=>new Response(JSON.stringify({ok:true,item:{}}),{headers:{'Content-Type':'application/json'}});
 try{const m=montar(Portal,{});const limpezas=m.effects.map(f=>f());await new Promise(resolve=>setTimeout(resolve,0));assert.equal(limpeza,0);assert.equal(window.location.hash,hash);assert.equal(m.estados[0],hash.slice(9));const recarregado=montar(Portal,{});assert.equal(recarregado.estados[0],m.estados[0]);window.location.hash='';listeners.hashchange();assert.equal(m.estados[0],'');for(const f of limpezas)f?.();}finally{globalThis.window=anterior;globalThis.fetch=fetchAnterior;}
});
