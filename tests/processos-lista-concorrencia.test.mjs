import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('vite'))('esbuild');
const arquivo=fileURLToPath(new URL('../src/pages/Processos.jsx',import.meta.url));
const stubs={
 react:'export const {useState,useEffect,useRef,useCallback}=globalThis.hooks;',
 'react/jsx-runtime':'export const Fragment="fragment",jsx=(type,props)=>({type,props}),jsxs=jsx;',
 'react-router-dom':'export const useSearchParams=globalThis.roteador;',
 'lucide-react':'export const ArrowRight=()=>{},BriefcaseBusiness=()=>{},ClipboardList=()=>{},ShieldCheck=()=>{},Search=()=>{},RefreshCw=()=>{},Plus=()=>{};',
};
const pacote=await build({entryPoints:[arquivo],bundle:true,write:false,format:'iife',globalName:'tela',platform:'node',jsx:'automatic',loader:{'.css':'empty'},logLevel:'silent',plugins:[{
 name:'componentes-e-rede-isolados',
 setup(b){
  b.onResolve({filter:/^(react|react\/jsx-runtime|react-router-dom|lucide-react)$/},a=>({path:a.path,namespace:'stub'}));
  b.onResolve({filter:/(services\/processos\.js|components\/ui\.jsx|EditorProcesso\.jsx|FichaProcesso\.jsx)$/},a=>({path:a.path,namespace:'stub'}));
  b.onLoad({filter:/.*/,namespace:'stub'},a=>({loader:'js',contents:stubs[a.path]||(
   a.path.includes('services/')?'export const chamarProcesso=globalThis.chamar;':
   a.path.includes('ui.jsx')?'export function PageTitle(){};export function Card(){};':
   a.path.includes('FichaProcesso')?'export default function FichaProcesso(){}':'export default function EditorProcesso(){}'
  )}));
 },
}]});

// Executa a página real com consultas adiadas. O navegador e os componentes
// filhos ficam fora deste teste; a ordem das respostas é inteiramente controlada.
function montar(){
 const estados=[],efeitos=[],pedidos=[];let indice=0,params=new URLSearchParams();
 const iguais=(a,b)=>a?.length===b?.length&&a?.every((v,i)=>Object.is(v,b[i]));
 const hooks={
  useState(inicial){const i=indice++;if(!(i in estados))estados[i]=typeof inicial==='function'?inicial():inicial;return [estados[i],valor=>{estados[i]=typeof valor==='function'?valor(estados[i]):valor;}];},
  useRef(inicial){const i=indice++;if(!(i in estados))estados[i]={current:inicial};return estados[i];},
  useCallback(fn,deps){const i=indice++;if(!estados[i]||!iguais(estados[i].deps,deps))estados[i]={fn,deps};return estados[i].fn;},
  useEffect(fn,deps){const i=indice++;if(!estados[i]||!iguais(estados[i].deps,deps)){estados[i]={deps};efeitos.push(fn);}},
 };
 const contexto={hooks,URLSearchParams,roteador:()=>[params,p=>{params=typeof p==='function'?p(params):p;}],chamar:action=>new Promise((resolve,reject)=>pedidos.push({action,resolve,reject}))};
 vm.runInNewContext(pacote.outputFiles[0].text,contexto);
 return {pedidos,abrir:id=>{params=new URLSearchParams({processo:id});},render(){indice=0;const arvore=contexto.tela.default({tipo:'consultoria'});while(efeitos.length)efeitos.shift()();return arvore;}};
}
const percorrer=no=>!no||typeof no!=='object'?[]:Array.isArray(no)?no.flatMap(percorrer):[no,...percorrer(no.props?.children)];
const ficha=arvore=>percorrer(arvore).find(no=>no.type?.name==='FichaProcesso');
const renderConcluido=()=>new Promise(resolve=>setImmediate(resolve));
const registro={id:'c1',tipo:'consultoria',versao:'v1',titulo:'Consultoria fictícia',situacao:'analise',setor:'financeiro',prioridade:'normal',responsavelRhId:'rh1',envolvidos:[{rhId:'rh1',nome:'Pessoa exemplo'}],etapas:[],registros:[],anexos:[],convites:[],podeAdministrarConsultoria:true};

for(const resultado of ['resposta antiga','erro antigo'])test(`ficha salva permanece atualizada quando chega ${resultado} da lista`,async()=>{
 const t=montar();t.render();t.pedidos.shift().resolve({itens:[registro]});await renderConcluido();
 const atualizar=percorrer(t.render()).find(no=>no.type==='button'&&JSON.stringify(no.props.children)?.includes('Atualizar'));
 assert.ok(atualizar);atualizar.props.onClick();const pendente=t.pedidos.shift();assert.equal(pendente.action,'listar');
 t.abrir(registro.id);
 ficha(t.render()).props.aoAtualizar({...registro,versao:'v2',titulo:'Título salvo'});
 assert.equal(ficha(t.render()).props.item.versao,'v2');
 if(resultado==='resposta antiga')pendente.resolve({itens:[registro]});else pendente.reject(new Error('Falha da consulta anterior'));
 await renderConcluido();const arvore=t.render();
 assert.equal(ficha(arvore).props.item.versao,'v2');
 assert.equal(ficha(arvore).props.item.titulo,'Título salvo');
 assert.equal(percorrer(arvore).some(no=>no.props?.role==='alert'),false);
 assert.equal(percorrer(arvore).some(no=>no.props?.role==='status'&&no.props.children==='Atualizando processos…'),false);
});
