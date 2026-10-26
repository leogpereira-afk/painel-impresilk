import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {prepararProcesso} from '../supabase/functions/_shared/processos.mjs';

const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite'))('esbuild');
let pacote;
async function componentes(){
 if(!pacote){
  const r=await build({stdin:{contents:`import React from 'react'; import Editor from './components/processos/EditorDemanda.jsx'; import Processo,{Campo,Opcoes} from './components/processos/EditorProcesso.jsx'; import {renderToStaticMarkup} from 'react-dom/server.browser'; export {React,Editor,Processo,Campo,Opcoes,renderToStaticMarkup};`,resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'esm',platform:'neutral',jsx:'automatic',conditions:['browser','import','default'],mainFields:['module','main'],loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
  pacote=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
 }
 return pacote;
}
const pessoas=[{id:'rh-alfa',idPessoa:'900001',nome:'Pessoa Álfa',area:'Produção',cargo:'Operação'},{id:'rh-beta',idPessoa:'900002',nome:'Pessoa Beta',area:'Comercial',cargo:''},{id:'rh-gama',idPessoa:'900003',nome:'Pessoa Álfa',area:'Financeiro',cargo:''}];
const gestor={sub:'gestor-ficticio',nome:'Gestor fictício',rhId:'rh-alfa'};
const etapa=extras=>({id:'etapa-ficticia',titulo:'Conferir a entrega',descricao:'Descrição preservada',responsavelRhId:'rh-alfa',prazo:'2020-01-10',situacao:'pendente',dependeDe:[],nota:'',concluidaEm:null,...extras});
const ficha=extras=>({id:'demanda-ficticia',tipo:'demanda',titulo:'Entrega fictícia',objetivo:'Conferir o fluxo',setor:'empresa',situacao:'analise',prioridade:'normal',prazo:'2020-01-30',analise:'Análise preservada',solucao:'Decisão preservada',empresa:'Campo anterior',especialidade:'Especialidade anterior',responsavelRhId:'rh-alfa',envolvidos:pessoas.slice(0,2).map(({id,...p})=>({...p,rhId:id})),etapas:[etapa()],criadoPor:gestor.sub,criadoPorNome:gestor.nome,criadoEm:'2020-01-01T12:00:00Z',versao:'versao-ficticia-1',registros:[{id:'registro-ficticio',texto:'Registro preservado'}],anexos:[{id:'anexo-ficticio'}],historico:[{id:'hist-ficticio'}],convites:[],consultores:[],origemReuniaoId:'reuniao-ficticia',origemDecisaoId:'decisao-ficticia',...extras});
const nos=e=>Array.isArray(e)?e.flatMap(nos):e&&typeof e==='object'?[e,...nos(e.props?.children)]:[];
const texto=e=>Array.isArray(e)?e.map(texto).join(''):e&&typeof e==='object'?texto(e.props?.children):String(e??'');
async function montar(extras={}){
 const c=await componentes(),estados=[];let indice=0,arvore,salvo;
 const props={pessoas,aoCancelar(){},aoSalvar(v){salvo=v;},...extras};
 const dispatcher={useState(inicial){const i=indice++;if(!(i in estados))estados[i]=typeof inicial==='function'?inicial():inicial;return [estados[i],v=>{estados[i]=typeof v==='function'?v(estados[i]):v;}];}};
 function render(){indice=0;const atual=c.React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher,antes=atual.current;atual.current=dispatcher;try{arvore=c.Editor(props);}finally{atual.current=antes;}return arvore;}
 const procurar=fn=>{const n=nos(arvore).find(fn);assert.ok(n,'Controle disponível');return n;};
 const campo=rotulo=>procurar(n=>n.props?.['aria-label']===rotulo);
 const botao=rotulo=>procurar(n=>n.type==='button'&&texto(n)===rotulo);
 function mudar(rotulo,value,evento='onChange'){campo(rotulo).props[evento]({target:{value},currentTarget:{value}});render();}
 function clicar(rotulo){botao(rotulo).props.onClick();render();}
 function salvar(){arvore.props.onSubmit({preventDefault(){}});render();return salvo;}
 render();
 return {props,render,campo,botao,procurar,mudar,clicar,salvar,get arvore(){return arvore;},get opcoes(){return nos(arvore).filter(n=>n.props?.className==='demanda-pessoa-opcao');},get etapas(){return nos(arvore).filter(n=>n.props?.className==='demanda-etapa');},get avancadas(){return nos(arvore).filter(n=>n.props?.className==='demanda-etapa-opcoes');}};
}

test('nova demanda mostra os essenciais, mantém RH recolhido e exige objetivo e responsável',async()=>{
 const f=await montar();
 assert.equal(f.opcoes.length,0);assert.equal(f.campo('Título da demanda').props.required,true);assert.equal(f.campo('Objetivo e resultado esperado').props.required,true);assert.equal(f.campo('Responsável pela demanda').props.required,true);
 assert.equal(f.botao('+ Adicionar etapa').props.disabled,true);
 f.mudar('Buscar pessoas no RH','  ');assert.equal(f.opcoes.length,0);
 f.clicar('Ver todas');assert.equal(f.opcoes.length,3);f.clicar('Recolher lista');assert.equal(f.opcoes.length,0);
});

test('pesquisa por ID, ficha, setor e nome sem acento seleciona o vínculo correto entre homônimos',async()=>{
 const f=await montar();
 f.mudar('Buscar pessoas no RH','900003');assert.equal(f.opcoes.length,1);f.opcoes[0].props.onClick();f.render();
 assert.equal(f.opcoes.length,0);assert.match(texto(f.arvore),/já estão selecionadas/);
 f.mudar('Buscar pessoas no RH','rh-beta');assert.equal(f.opcoes.length,1);assert.match(texto(f.opcoes[0]),/Pessoa Beta/);
 f.mudar('Buscar pessoas no RH','producao');assert.equal(f.opcoes.length,1);
 f.mudar('Buscar pessoas no RH','alfa');assert.equal(f.opcoes.length,1);f.opcoes[0].props.onClick();f.render();
 const salvo=f.salvar();assert.deepEqual(salvo.envolvidos.map(p=>p.rhId),['rh-gama','rh-alfa']);
 f.campo('Remover Pessoa Álfa · ID 900003').props.onClick();f.render();assert.deepEqual(f.salvar().envolvidos.map(p=>p.rhId),['rh-alfa']);
});

test('salvar alteração simples preserva campos recolhidos, etapas legadas, histórico, origem e versão anterior',async()=>{
 const item=ficha({etapas:[etapa({situacao:'concluida',concluidaEm:'2020-01-05T12:00:00Z',avaliacoes:[{pontuacao:8,comentario:'Avaliação fictícia'}]})]}),original=structuredClone(item),f=await montar({item});
 assert.equal(f.etapas[0].props.open,false);assert.equal(f.avancadas[0].props.open,false);assert.equal(f.campo('Início real da etapa 1').props.required,false);
 f.mudar('Título da demanda','Entrega revisada');f.mudar('Prazo geral','2020-02-10','onInput');
 const payload=f.salvar();assert.equal(payload.versaoAnterior,item.versao);assert.equal(payload.prazo,'2020-02-10');assert.deepEqual(payload.envolvidos,item.envolvidos);
 const salvo=prepararProcesso(payload,item,gestor,pessoas,'2020-01-31T12:00:00Z');
 for(const campo of ['analise','solucao','empresa','especialidade','etapas','historico','registros','anexos','origemReuniaoId','origemDecisaoId'])assert.deepEqual(salvo[campo],item[campo],campo);
 assert.deepEqual(salvo.envolvidos,item.envolvidos.map(({idPessoa,...p})=>p));
 assert.deepEqual(item,original);
 assert.throws(()=>prepararProcesso(payload,{...item,versao:'versao-ficticia-2'},gestor,pessoas),e=>e.status===409);
});

test('remover responsável por etapas é bloqueado sem perder vínculos e revela a etapa a corrigir',async()=>{
 const item=ficha(),f=await montar({item});
 f.campo('Remover Pessoa Álfa · ID 900001').props.onClick();f.render();
 assert.match(texto(f.arvore),/troque o responsável da etapa: Conferir a entrega/);assert.equal(f.etapas[0].props.open,true);assert.deepEqual(f.salvar().envolvidos,item.envolvidos);
 f.mudar('Responsável da etapa 1','rh-beta');f.campo('Remover Pessoa Álfa · ID 900001').props.onClick();f.render();
 assert.match(texto(f.arvore),/Escolha outro responsável pela demanda/);assert.equal(f.salvar().envolvidos.length,2);
 f.mudar('Responsável pela demanda','rh-beta');f.campo('Remover Pessoa Álfa · ID 900001').props.onClick();f.render();
 const payload=f.salvar();assert.equal(payload.envolvidos.length,1);assert.equal(prepararProcesso(payload,item,gestor,pessoas).etapas[0].responsavelRhId,'rh-beta');
});

test('vínculo anterior fora do RH continua disponível inclusive após remover e adicionar novamente',async()=>{
 const anterior={rhId:'rh-anterior',nome:'Pessoa anterior',area:'Setor anterior',cargo:'Cargo anterior'};
 const item=ficha({envolvidos:[...ficha().envolvidos,anterior]}),f=await montar({item});
 assert.match(texto(f.arvore),/vínculo anterior/);f.campo('Remover Pessoa anterior · Ficha RH rh-anterior').props.onClick();f.render();
 f.mudar('Buscar pessoas no RH','rh-anterior');assert.equal(f.opcoes.length,1);f.opcoes[0].props.onClick();f.render();
 const salvo=prepararProcesso(f.salvar(),item,gestor,pessoas);assert.deepEqual(salvo.envolvidos.find(p=>p.rhId==='rh-anterior'),anterior);
});

test('limite de 150 pessoas impede inclusão adicional sem alterar os selecionados',async()=>{
 const envolvidos=Array.from({length:150},(_,i)=>({rhId:`rh-existente-${i}`,nome:`Pessoa fictícia ${i}`}));
 const f=await montar({item:ficha({envolvidos,responsavelRhId:envolvidos[0].rhId,etapas:[]})});
 f.mudar('Buscar pessoas no RH','900001');assert.equal(f.opcoes[0].props.disabled,true);f.opcoes[0].props.onClick();f.render();
 assert.match(texto(f.arvore),/até 150 pessoas/);assert.deepEqual(f.salvar().envolvidos,envolvidos);
});

test('etapa nova fica aberta enquanto faltar título ou responsável, sem esconder required',async()=>{
 const f=await montar({item:ficha({etapas:[]})});f.clicar('+ Adicionar etapa');
 assert.equal(f.etapas[0].props.open,true);assert.equal(f.campo('Nome da etapa 1').props.required,true);assert.equal(f.avancadas[0].props.open,false);
 let bloqueou=false;nos(f.etapas[0]).find(n=>n.type==='summary').props.onClick({preventDefault(){bloqueou=true;}});assert.equal(bloqueou,true);
 f.mudar('Nome da etapa 1','Nova entrega');f.mudar('Responsável da etapa 1','');assert.equal(f.etapas[0].props.open,true);
 f.mudar('Responsável da etapa 1','rh-beta');bloqueou=false;nos(f.etapas[0]).find(n=>n.type==='summary').props.onClick({preventDefault(){bloqueou=true;}});assert.equal(bloqueou,false);
 f.etapas[0].props.onToggle({currentTarget:{open:false}});f.render();assert.equal(f.etapas[0].props.open,false);
 assert.equal(prepararProcesso(f.salvar(),f.props.item,gestor,pessoas).etapas[0].titulo,'Nova entrega');
});

test('mudança de andamento abre datas obrigatórias, captura input e aceita payload completo',async()=>{
 const item=ficha(),f=await montar({item});f.mudar('Situação da etapa 1','validacao');
 assert.equal(f.etapas[0].props.open,true);assert.equal(f.avancadas[0].props.open,true);assert.equal(f.campo('Início real da etapa 1').props.required,true);assert.equal(f.campo('Término real da etapa 1').props.required,true);
 let bloqueou=false;nos(f.avancadas[0]).find(n=>n.type==='summary').props.onClick({preventDefault(){bloqueou=true;}});assert.equal(bloqueou,true);
 f.mudar('Início real da etapa 1','2020-01-02','onInput');f.mudar('Término real da etapa 1','2020-01-05','onInput');f.mudar('Prazo da etapa 1','2020-01-11','onInput');
 const salvo=prepararProcesso(f.salvar(),item,gestor,pessoas,'2020-01-31T12:00:00Z');assert.equal(salvo.etapas[0].progresso,100);assert.equal(salvo.etapas[0].inicioReal,'2020-01-02');assert.equal(salvo.etapas[0].fimReal,'2020-01-05');assert.equal(salvo.etapas[0].prazo,'2020-01-11');
});

test('bloqueio abre motivo obrigatório e etapas com atividade não oferecem retirada',async()=>{
 const f=await montar({item:ficha({etapas:[etapa({atividadeRegistrada:true})]})});f.mudar('Situação da etapa 1','bloqueada');
 assert.equal(f.campo('Andamento da etapa 1').props.required,true);assert.equal(f.avancadas[0].props.open,true);assert.ok(!nos(f.arvore).some(n=>n.type==='button'&&texto(n)==='Retirar etapa'));
 f.mudar('Andamento da etapa 1','Aguardar informação fictícia');assert.equal(prepararProcesso(f.salvar(),f.props.item,gestor,pessoas).etapas[0].situacao,'bloqueada');
});

test('progresso informado em etapa bloqueada também exige início real sem inventar uma data',async()=>{
 const f=await montar({item:ficha({etapas:[etapa({situacao:'bloqueada',nota:'Aguardar informação fictícia'})]})});
 assert.equal(f.campo('Início real da etapa 1').props.required,false);
 f.mudar('Progresso da etapa 1','25');assert.equal(f.avancadas[0].props.open,true);assert.equal(f.campo('Início real da etapa 1').props.required,true);assert.equal(f.campo('Início real da etapa 1').props.value,'');
 f.mudar('Início real da etapa 1','2020-01-02','onInput');assert.equal(prepararProcesso(f.salvar(),f.props.item,gestor,pessoas).etapas[0].progresso,25);
});

test('retirar etapa sem atividade limpa apenas dependências e mantém a outra etapa',async()=>{
 const item=ficha({etapas:[etapa(),etapa({id:'etapa-segunda',titulo:'Segunda etapa',dependeDe:['etapa-ficticia']})]}),f=await montar({item});
 f.clicar('Retirar etapa');const salvo=prepararProcesso(f.salvar(),item,gestor,pessoas);
 assert.equal(salvo.etapas.length,1);assert.equal(salvo.etapas[0].id,'etapa-segunda');assert.deepEqual(salvo.etapas[0].dependeDe,[]);
});

test('dispatch mantém Consultorias no editor anterior e conserva Campo e Opcoes compartilhados',async()=>{
 const c=await componentes(),props={item:ficha({tipo:'consultoria',empresa:'Empresa fictícia'}),tipo:'consultoria',pessoas,aoSalvar(){},aoCancelar(){}};
 assert.notEqual(c.Processo(props).type,c.Editor);assert.equal(c.Processo({...props,tipo:'demanda'}).type,c.Editor);
 const html=c.renderToStaticMarkup(c.React.createElement(c.Processo,props));
 assert.match(html,/Consultoria \/ empresa ou profissional/);assert.match(html,/Pessoas envolvidas · RH/);assert.match(html,/Salvar ficha e prazos/);assert.doesNotMatch(html,/demanda-editor/);
 assert.equal(typeof c.Campo,'function');assert.equal(typeof c.Opcoes,'function');
});
