import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite'))('esbuild');
let pacote;
async function componentes(){
 if(!pacote){
  const r=await build({stdin:{contents:`
   import React from 'react';
   import {renderToStaticMarkup} from 'react-dom/server.browser';
   import {MemoryRouter} from 'react-router-dom';
   import Editor,{previsaoEditor} from './components/reunioes/EditorReuniao.jsx';
   import Programacao,{regraInicial} from './components/reunioes/ProgramacaoReuniao.jsx';
   import Responsavel from './components/reunioes/ResponsavelReuniao.jsx';
   import Participantes from './components/ParticipantesReuniao.jsx';
   import Ata from './components/reunioes/AtaReuniao.jsx';
   import Encaminhamentos from './components/reunioes/EncaminhamentosReuniao.jsx';
   import {identificarPessoa,filtrarPessoas} from './components/reunioes/pessoas.js';
   export {React,Editor,Programacao,Responsavel,Participantes,Ata,Encaminhamentos,previsaoEditor,regraInicial,identificarPessoa,filtrarPessoas};
   export const html=(Componente,props)=>renderToStaticMarkup(<MemoryRouter><Componente {...props}/></MemoryRouter>);
  `,resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'esm',platform:'neutral',jsx:'automatic',conditions:['browser','import','default'],mainFields:['module','main'],loader:{'.css':'empty'},define:{'import.meta.env':'{"MODE":"test"}','process.env.NODE_ENV':'"production"'},logLevel:'silent'});
  pacote=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
 }
 return pacote;
}
const base=extras=>({id:'encontro-ficticio',titulo:'Planejamento de exemplo',data:'2099-05-04',inicio:'09:00',fim:'10:00',tipo:'reuniao',setor:'empresa',situacao:'agendado',responsavel:'Pessoa de exemplo',local:'Sala de exemplo',pauta:'Conferir a semana',ata:'',participantes:[],decisoes:[],anexos:[],registros:[],versaoAnterior:null,...extras});
const pessoas=[{id:'rh-a',idPessoa:'123456',nome:'Pessoa Álfa',area:'Produção',cargo:'Operação'},{id:'rh-b',nome:'Pessoa Beta',area:'Comercial',cargo:''}];
const catalogo={pessoas,carregando:false,erro:'',carregar(){}};
const nos=e=>Array.isArray(e)?e.flatMap(nos):e&&typeof e==='object'?[e,...nos(e.props?.children)]:[];
const texto=e=>Array.isArray(e)?e.map(texto).join(''):e&&typeof e==='object'?texto(e.props?.children):String(e??'');
async function montar(nome,props){
 const c=await componentes(),estados=[];let indice=0,arvore;
 const dispatcher={useState(inicial){const i=indice++;if(!(i in estados))estados[i]=typeof inicial==='function'?inicial():inicial;return [estados[i],v=>{estados[i]=typeof v==='function'?v(estados[i]):v;}];},useEffect(){indice++;}};
 function render(){indice=0;const dispatcherAtual=c.React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher,antes=dispatcherAtual.current;dispatcherAtual.current=dispatcher;try{arvore=c[nome](props);}finally{dispatcherAtual.current=antes;}return arvore;}
 function componente(qual){const x=nos(arvore).find(n=>n.type===c[qual]);assert.ok(x,qual+' disponível');return x;}
 function botao(rotulo){const x=nos(arvore).find(n=>n.type==='button'&&texto(n)===rotulo);assert.ok(x,rotulo+' disponível');return x;}
 render();return {c,render,componente,botao,get arvore(){return arvore;},async enviar(){await nos(arvore).find(n=>n.type==='form').props.onSubmit({preventDefault(){}});render();},mudarCampo(rotulo,value){const campo=nos(arvore).find(n=>n.props?.titulo===rotulo);assert.ok(campo,rotulo+' disponível');nos(campo).find(n=>['input','select','textarea'].includes(n.type)).props.onChange({target:{value}});render();}};
}

test('encontro único salva diretamente, sem recorrência ou conversão automática',async()=>{
 const chamadas=[],f=await montar('Editor',{item:base(),aoFechar(){},aoSalvar:async(...x)=>chamadas.push(x)});
 assert.equal(chamadas.length,0);await f.enviar();assert.equal(chamadas.length,1);assert.equal(chamadas[0][0].id,'encontro-ficticio');assert.deepEqual(chamadas[0][1],{});
});

test('evento input de data/hora persiste ao alternar para recorrente',async()=>{
 const chamadas=[],f=await montar('Editor',{item:base(),aoFechar(){},aoSalvar:async(...x)=>chamadas.push(x)});
 for(const [rotulo,value] of [['Data *','2099-05-11'],['Início *','11:00'],['Fim *','12:00']]){
  const campo=nos(f.arvore).find(n=>n.props?.titulo===rotulo),input=nos(campo).find(n=>n.type==='input');
  assert.equal(typeof input.props.onInput,'function');input.props.onInput({currentTarget:{value}});f.render();
 }
 f.componente('Programacao').props.aoRecorrente(true);f.render();assert.equal(f.componente('Programacao').props.datas[0],'2099-05-11');
 await f.enviar();await f.enviar();assert.equal(chamadas[0][0].data,'2099-05-11');assert.equal(chamadas[0][0].inicio,'11:00');assert.equal(chamadas[0][0].fim,'12:00');
});

test('série semanal apresenta datas e só grava após confirmação explícita',async()=>{
 const chamadas=[],f=await montar('Editor',{item:base(),aoFechar(){},aoSalvar:async(...x)=>chamadas.push(x)});
 f.componente('Programacao').props.aoRecorrente(true);f.render();
 f.componente('Programacao').props.aoRegra({...f.componente('Programacao').props.regra,quantidade:3});f.render();
 assert.deepEqual(f.componente('Programacao').props.datas,['2099-05-04','2099-05-11','2099-05-18']);
 await f.enviar();assert.equal(chamadas.length,0);assert.match(texto(f.arvore),/Criar 3 encontros/);
 await f.enviar();assert.equal(chamadas.length,1);assert.equal(chamadas[0][1].recorrencia.quantidade,3);assert.equal(chamadas[0][1].recorrencia.frequencia,'semanal');
});

test('alterar programação depois da revisão invalida a confirmação anterior',async()=>{
 const chamadas=[],f=await montar('Editor',{item:base(),aoFechar(){},aoSalvar:async(...x)=>chamadas.push(x)});
 f.componente('Programacao').props.aoRecorrente(true);f.render();await f.enviar();f.mudarCampo('Título *','Novo título de exemplo');await f.enviar();assert.equal(chamadas.length,0);await f.enviar();assert.equal(chamadas.length,1);assert.equal(chamadas[0][0].titulo,'Novo título de exemplo');
});

test('recorrência inválida bloqueia envio e explica dias/limites',async()=>{
 const chamadas=[],f=await montar('Editor',{item:base(),aoFechar(){},aoSalvar:async(...x)=>chamadas.push(x)});
 f.componente('Programacao').props.aoRecorrente(true);f.render();f.componente('Programacao').props.aoRegra({...f.componente('Programacao').props.regra,diasSemana:[]});f.render();await f.enviar();assert.equal(chamadas.length,0);assert.match(f.componente('Programacao').props.erro,/dia/i);
 f.componente('Programacao').props.aoRegra({...f.componente('Programacao').props.regra,diasSemana:[1],quantidade:105});f.render();assert.match(f.componente('Programacao').props.erro,/104/);assert.equal(f.botao('Revisar criação da série').props.disabled,true);
});

test('edição coletiva mostra preservadas e envia versões da abertura para CAS',async()=>{
 const r=base({serieId:'serie-ficticia',indice:1,total:3,regra:{frequencia:'semanal',intervalo:1,diasSemana:[1],termino:'quantidade',quantidade:3},versao:'v1',versaoAnterior:'v1'}),segundo={...r,id:'segundo',indice:2,data:'2099-05-11',versao:'v2'},ata={...r,id:'com-ata',indice:3,data:'2099-05-18',versao:'v3',ata:'Discussão preservada'};
 const chamadas=[],itens=[r,segundo,ata],f=await montar('Editor',{item:r,itens,aoFechar(){},aoSalvar:async(...x)=>chamadas.push(x)});
 f.componente('Programacao').props.aoEscopo('proximas');f.render();
 assert.equal(f.componente('Programacao').props.alvos.length,2);assert.equal(f.componente('Programacao').props.preservadas,1);assert.ok(!nos(f.arvore).some(n=>n.type===f.c.Ata));
 itens[1]={...segundo,versao:'v-atualizada'};
 await f.enviar();assert.equal(chamadas.length,0);await f.enviar();assert.equal(chamadas.length,1);assert.deepEqual(chamadas[0][1],{escopo:'proximas',versoesAnteriores:{'encontro-ficticio':'v1',segundo:'v2'}});
});

test('prévia de conflito usa deslocamento e IDs de encontros existentes sem autoconflito',async()=>{
 const {previsaoEditor}=await componentes(),p={id:'convite',rhId:'rh-a',nome:'Pessoa Álfa',presenca:'pendente'};
 const r=base({serieId:'s',indice:1,versao:'v1',versaoAnterior:'v1',participantes:[p]}),segundo={...r,id:'segundo',indice:2,data:'2099-05-11'},outro={...r,id:'outro',serieId:null,data:'2099-05-12',titulo:'Outro encontro'};
 const previa=previsaoEditor({...r,data:'2099-05-05'},r,[r,segundo,outro],false,{},'serie','2099-05-01T12:00:00Z');
 assert.deepEqual(previa.datas,['2099-05-05','2099-05-12']);assert.equal(previa.conflitos.length,1);assert.equal(previa.conflitos[0].reuniaoId,'outro');
});

test('pessoas são buscadas por nome, ID oficial e ficha, sem fabricar identidade',async()=>{
 const {filtrarPessoas,identificarPessoa}=await componentes();
 for(const busca of ['alfa','123456','rh-a'])assert.equal(filtrarPessoas(pessoas,busca)[0].id,'rh-a');
 assert.equal(identificarPessoa(pessoas[0]),'ID 123456');assert.equal(identificarPessoa(pessoas[1]),'Ficha RH rh-b');assert.equal(identificarPessoa({id:'123456',nome:'Mesmo número sem identidade'}),'Ficha RH 123456');
 const {html,Participantes}=await componentes(),legado={id:'legado',nome:'Convidado antigo',presenca:'presente',rhId:null};
 const saida=html(Participantes,{participantes:[legado,{id:'p-a',rhId:'rh-a',idPessoa:'123456',nome:'Pessoa Álfa',presenca:'pendente'}],aoMudar(){},catalogo});
 assert.match(saida,/Convidado antigo/);assert.match(saida,/ID 123456/);assert.match(saida,/Ficha RH rh-b/);
});

test('selecionar responsável grava vínculo explícito sem deduzir pelo texto',async()=>{
 let escolhido;const f=await montar('Responsavel',{valor:{responsavel:'Pessoa Álfa'},aoMudar:v=>{escolhido=v;},catalogo});
 f.botao('Escolher no RH').props.onClick();f.render();const escolher=nos(f.arvore).find(n=>n.type==='button'&&texto(n).startsWith('Pessoa Álfa'));escolher.props.onClick();f.render();assert.deepEqual(escolhido,{responsavel:'Pessoa Álfa',responsavelRhId:'rh-a',responsavelIdPessoa:'123456'});
 nos(f.arvore).find(n=>n.type==='input'&&n.props['aria-label']==='Responsável').props.onChange({target:{value:'Pessoa Beta'}});assert.equal(escolhido.responsavelRhId,'');assert.equal(escolhido.responsavelIdPessoa,'');
});

test('ata começa recolhida, exibe situação e preserva versões com autoria',async()=>{
 const {html,Ata}=await componentes(),saida=html(Ata,{item:base({ata:'Texto atual',ataSituacao:'finalizada',ataVersoes:[{texto:'Texto anterior',situacao:'rascunho',em:'2026-10-26T12:00:00Z',nome:'Pessoa de exemplo',por:'demo'}]}),aoMudar(){}});
 assert.match(saida,/Finalizada/);assert.match(saida,/Texto anterior/);assert.match(saida,/Pessoa de exemplo/);assert.doesNotMatch(saida,/<details[^>]*class="[^"]*reu-ata"[^>]*open/);
});

test('converter decisão exige ação explícita, permissão, RH e prazo; vínculo vira link',async()=>{
 const {html,Encaminhamentos}=await componentes(),d={id:'decisao',texto:'Tarefa de exemplo',responsavel:'Pessoa Álfa',responsavelRhId:'rh-a',prazo:'2099-05-12'},item=base({podeEditar:true,decisoes:[d]});let chamadas=0;
 const leitura=html(Encaminhamentos,{item,podeDemandas:false,aoCriarDemanda(){chamadas++;}});assert.doesNotMatch(leitura,/Criar demanda/);assert.equal(chamadas,0);
 const f=await montar('Encaminhamentos',{item,podeDemandas:true,aoCriarDemanda(id){assert.equal(id,'decisao');chamadas++;}});assert.equal(chamadas,0);f.botao('Criar demanda').props.onClick();assert.equal(chamadas,1);
 const incompleta=html(Encaminhamentos,{item:{...item,decisoes:[{...d,responsavelRhId:null}]},podeDemandas:true});assert.match(incompleta,/<button[^>]*disabled=""[^>]*>Criar demanda/);
 const vinculada=html(Encaminhamentos,{item:{...item,decisoes:[{...d,demandaId:'demanda-exemplo'}]},podeDemandas:true});assert.match(vinculada,/href="\/demandas\?processo=demanda-exemplo"/);assert.doesNotMatch(vinculada,/Criar demanda/);
});
