import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite'))('esbuild');
let pacote;
async function componentes(){
 if(!pacote){
  const r=await build({stdin:{contents:`import React from 'react'; import Participantes from './components/ParticipantesReuniao.jsx'; export {React,Participantes};`,resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'esm',platform:'neutral',jsx:'automatic',conditions:['browser','import','default'],mainFields:['module','main'],loader:{'.css':'empty'},define:{'import.meta.env':'{"MODE":"test"}','process.env.NODE_ENV':'"production"'},logLevel:'silent'});
  pacote=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
 }
 return pacote;
}
const pessoas=[
 {id:'rh-alfa',idPessoa:'900001',nome:'Pessoa Álfa',area:'Produção',cargo:'Operação'},
 {id:'rh-beta',idPessoa:'900002',nome:'Pessoa Beta',area:'Comercial',cargo:''},
 {id:'rh-gama',nome:'Pessoa Gama',area:'Produção',cargo:''},
];
const selecionada={id:'participante-preservado',rhId:'rh-alfa',idPessoa:'900001',nome:'Pessoa Álfa',area:'Produção',presenca:'presente'};
const nos=e=>Array.isArray(e)?e.flatMap(nos):e&&typeof e==='object'?[e,...nos(e.props?.children)]:[];
const texto=e=>Array.isArray(e)?e.map(texto).join(''):e&&typeof e==='object'?texto(e.props?.children):String(e??'');
async function montar(extras={}){
 const c=await componentes(),estados=[];let indice=0,arvore,chamadas=0;
 const props={participantes:[],catalogo:{pessoas,carregando:false,erro:'',carregar(){}},...extras,aoMudar(v){props.participantes=v;chamadas++;}};
 const dispatcher={useState(inicial){const i=indice++;if(!(i in estados))estados[i]=typeof inicial==='function'?inicial():inicial;return [estados[i],v=>{estados[i]=typeof v==='function'?v(estados[i]):v;}];},useRef(inicial){const i=indice++;if(!(i in estados))estados[i]={current:inicial};return estados[i];},useEffect(){indice++;}};
 function render(){indice=0;const atual=c.React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher,antes=atual.current;atual.current=dispatcher;try{arvore=c.Participantes(props);}finally{atual.current=antes;}return arvore;}
 const procurar=predicado=>{const n=nos(arvore).find(predicado);assert.ok(n,'controle disponível');return n;};
 const botao=rotulo=>procurar(n=>n.type==='button'&&texto(n)===rotulo);
 const campo=rotulo=>procurar(n=>n.props?.['aria-label']===rotulo);
 function clicar(rotulo){botao(rotulo).props.onClick();render();}
 function mudar(rotulo,value){campo(rotulo).props.onChange({target:{value}});render();}
 render();
 return {props,render,procurar,botao,campo,clicar,mudar,get arvore(){return arvore;},get chamadas(){return chamadas;},get opcoes(){return nos(arvore).filter(n=>n.props?.className==='reu-pessoas-opcao');},get detalhes(){return nos(arvore).find(n=>n.type==='details');}};
}

test('diretório e inclusão em grupo começam recolhidos; ver todas é uma ação explícita',async()=>{
 const f=await montar();
 assert.equal(f.opcoes.length,0);assert.ok(!nos(f.arvore).some(n=>n.type==='button'&&/^Adicionar /.test(texto(n))));
 assert.equal(f.botao('Ver todas as pessoas').props['aria-expanded'],false);
 f.mudar('Buscar pessoas no RH','   ');assert.equal(f.opcoes.length,0);
 f.clicar('Ver todas as pessoas');assert.equal(f.opcoes.length,3);assert.ok(f.botao('Adicionar 3 pessoas'));
 f.clicar('Recolher lista');assert.equal(f.opcoes.length,0);assert.equal(f.chamadas,0);
});

test('busca por ID/nome e setor restringe a inclusão aos resultados escolhidos',async()=>{
 const f=await montar();
 f.mudar('Buscar pessoas no RH','900002');assert.equal(f.opcoes.length,1);assert.match(texto(f.opcoes[0]),/Pessoa Beta/);
 f.clicar('Adicionar 1 do filtro');assert.equal(f.props.participantes[0].rhId,'rh-beta');assert.equal(f.props.participantes[0].idPessoa,'900002');
 assert.equal(f.opcoes.length,0);assert.match(texto(f.arvore),/já estão selecionadas/);
 f.mudar('Buscar pessoas no RH','alfa');assert.equal(f.opcoes.length,1);
 f.mudar('Setor das pessoas no RH','Comercial');assert.equal(f.opcoes.length,0);assert.match(texto(f.arvore),/Nenhuma pessoa encontrada/);
 f.mudar('Buscar pessoas no RH','');f.mudar('Setor das pessoas no RH','Produção');
 assert.equal(f.opcoes.length,2);f.clicar('Adicionar 2 do filtro');
 assert.deepEqual(f.props.participantes.map(p=>p.rhId),['rh-beta','rh-alfa','rh-gama']);
 assert.ok(f.props.participantes.every(p=>p.id&&p.presenca==='pendente'));
});

test('chips removem por vínculo de participante e resultados não repetem os selecionados',async()=>{
 const homonimo={id:'externo-ficticio',rhId:null,nome:'Pessoa Álfa',presenca:'ausente'};
 const f=await montar({participantes:[selecionada,homonimo]});
 assert.equal(f.detalhes.props.open,false);
 f.clicar('Ver todas as pessoas');assert.equal(f.opcoes.length,2);assert.ok(f.opcoes.every(n=>!texto(n).includes('Pessoa Álfa')));
 f.campo('Remover Pessoa Álfa').props.onClick();f.render();
 assert.deepEqual(f.props.participantes,[homonimo]);assert.equal(f.opcoes.length,3);
 f.opcoes.find(n=>texto(n).includes('Pessoa Álfa')).props.onClick();f.render();
 assert.equal(f.props.participantes.length,2);assert.equal(f.props.participantes[0].id,'externo-ficticio');assert.equal(f.props.participantes[1].rhId,'rh-alfa');
});

test('limite de 150 bloqueia adição de grupo inteira e preserva presença existente',async()=>{
 const participantes=Array.from({length:149},(_,i)=>({id:`existente-${i}`,rhId:`rh-existente-${i}`,nome:`Pessoa de teste ${i}`,presenca:'presente'}));
 const f=await montar({participantes});f.mudar('Setor das pessoas no RH','Produção');f.clicar('Adicionar 2 do filtro');
 assert.equal(f.chamadas,0);assert.deepEqual(f.props.participantes,participantes);assert.match(texto(f.arvore),/até 150 participantes/);
 f.opcoes[0].props.onClick();f.render();assert.equal(f.props.participantes.length,150);
 assert.equal(f.props.participantes[0].presenca,'presente');assert.equal(f.botao('+ Convidado externo').props.disabled,true);
 f.opcoes[0].props.onClick();f.render();assert.equal(f.props.participantes.length,150);assert.equal(f.chamadas,1);
});

test('convidado vazio abre controles e mantém required visível até preenchimento',async()=>{
 const f=await montar({participantes:[selecionada]});assert.equal(f.detalhes.props.open,false);
 f.clicar('+ Convidado externo');assert.equal(f.detalhes.props.open,true);
 assert.equal(f.campo('Participante 2').props.required,true);assert.equal(f.props.participantes[0].presenca,'presente');
 let bloqueado=false;f.procurar(n=>n.type==='summary').props.onClick({preventDefault(){bloqueado=true;}});assert.equal(bloqueado,true);
 f.mudar('Participante 2','Convidado exemplo');
 bloqueado=false;f.procurar(n=>n.type==='summary').props.onClick({preventDefault(){bloqueado=true;}});assert.equal(bloqueado,false);
 f.detalhes.props.onToggle({currentTarget:{open:false}});f.render();assert.equal(f.detalhes.props.open,false);
 const incompleto=await montar({participantes:[{id:'pendente',nome:'',rhId:null,presenca:'pendente'}]});assert.equal(incompleto.detalhes.props.open,true);
});

test('presença e vínculo de convidado alteram apenas campos escolhidos e preservam IDs',async()=>{
 const externo={id:'convite-existente',rhId:null,nome:'Convidado exemplo',presenca:'justificada'};
 const f=await montar({participantes:[selecionada,externo]});
 f.mudar('Presença de Pessoa Álfa','ausente');assert.equal(f.props.participantes[0].id,'participante-preservado');assert.equal(f.props.participantes[0].presenca,'ausente');assert.equal(f.props.participantes[1].presenca,'justificada');
 const vinculo=f.campo('Vincular Convidado exemplo ao RH');assert.ok(!nos(vinculo).some(n=>n.type==='option'&&n.props.value==='rh-alfa'));
 f.mudar('Vincular Convidado exemplo ao RH','rh-beta');
 assert.deepEqual(f.props.participantes[1],{...externo,rhId:'rh-beta',idPessoa:'900002',nome:'Pessoa Beta',area:'Comercial',cargo:''});
 const bloqueada=await montar({participantes:[selecionada],presencaEditavel:false});assert.equal(bloqueada.campo('Presença de Pessoa Álfa').props.disabled,true);
});

test('falha e carregamento continuam visíveis sem lista; tentar novamente chama o catálogo',async()=>{
 const carregando=await montar({catalogo:{pessoas:[],carregando:true,erro:'',carregar(){}}});assert.match(texto(carregando.arvore),/Buscando pessoas no RH/);
 let tentativas=0;const f=await montar({participantes:[selecionada],catalogo:{pessoas:[],carregando:false,erro:'Consulta indisponível',carregar(){tentativas++;}}});
 assert.match(texto(f.arvore),/Consulta indisponível/);f.clicar('Tentar novamente');assert.equal(tentativas,1);
 assert.equal(f.props.participantes[0].id,'participante-preservado');assert.equal(f.chamadas,0);
 f.clicar('Ver todas as pessoas');assert.ok(!nos(f.arvore).some(n=>n.type==='button'&&/^Adicionar /.test(texto(n))));
});
