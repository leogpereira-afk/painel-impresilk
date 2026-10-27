import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite'))('esbuild');
let pacote;
async function componentes(){
 if(!pacote){
  const r=await build({stdin:{contents:`import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server.browser'; import Acoes,{AcoesConsultoria,CamposRegistro,HistoricoRegistro,filtrarAcoes} from './components/processos/AcoesProcesso.jsx'; export {React,Acoes,AcoesConsultoria,CamposRegistro,HistoricoRegistro,filtrarAcoes}; export const html=(C,p)=>renderToStaticMarkup(<C {...p}/>);`,resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'esm',platform:'neutral',jsx:'automatic',conditions:['browser','import','default'],mainFields:['module','main'],loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
  pacote=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
 }
 return pacote;
}
const registro=(extras={})=>({id:'acao-exemplo',tipo:'acao',titulo:'Mapeamento fictício',dataAcao:'2026-10-01',texto:'Texto original de exemplo',resultado:'Fluxo de exemplo desenhado',proximoPasso:'Conferir com o responsável',etapaId:'etapa-exemplo',nome:'Consultora Exemplo',por:'outra-pessoa',em:'2026-10-01T12:00:00Z',compartilhado:true,podeEditar:true,podeAtualizar:false,implantacao:{situacao:'em_implantacao',como:'Teste fictício'},revisoes:[],...extras});
const base=(extras={})=>({id:'consultoria-exemplo',tipo:'consultoria',versao:'v1',podeContribuir:true,etapas:[{id:'etapa-exemplo',titulo:'Diagnóstico de exemplo'}],registros:[registro()],...extras});
const nos=e=>Array.isArray(e)?e.flatMap(nos):e&&typeof e==='object'?[e,...nos(e.props?.children)]:[];
const texto=e=>Array.isArray(e)?e.map(texto).join(''):e&&typeof e==='object'?texto(e.props?.children):String(e??'');
async function montar(extras={}){
 const c=await componentes(),estados=[],chamadas=[];let indice=0,arvore;
 const props={item:base(),externo:true,ocupado:false,executar:async(...a)=>{chamadas.push(a);return true;},irArquivos(){},...extras};
 const dispatcher={useRef(){return {current:null};},useEffect(){},useState(inicial){const i=indice++;if(!(i in estados))estados[i]=typeof inicial==='function'?inicial():inicial;return [estados[i],v=>{estados[i]=typeof v==='function'?v(estados[i]):v;}];}};
 function render(){indice=0;const d=c.React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher,antes=d.current;d.current=dispatcher;try{arvore=c.Acoes(props).type(props);}finally{d.current=antes;}return arvore;}
 function procurar(fn){const n=nos(arvore).find(fn);assert.ok(n,'Controle disponível');return n;}
 function clicar(rotulo){procurar(n=>n.type==='button'&&(texto(n).trim()===rotulo||n.props['aria-label']===rotulo)).props.onClick();render();}
 function mudar(k,v){const no=procurar(n=>n.type===c.CamposRegistro);no.props.mudar({...no.props.valor,[k]:v});render();}
 async function salvar(){await procurar(n=>n.type==='form').props.onSubmit({preventDefault(){}});render();return chamadas.at(-1);}
 render();return {c,props,chamadas,render,procurar,clicar,mudar,salvar,get arvore(){return arvore;}};
}

test('consultor edita ação compartilhada de outro autor somente com permissão explícita',async()=>{
 const f=await montar(),original=structuredClone(f.props.item);f.clicar('Editar ação: Mapeamento fictício');f.mudar('titulo','Entrega revisada de exemplo');f.mudar('texto','Texto corrigido');f.mudar('resultado','Resultado atualizado');f.mudar('proximoPasso','Conferir versão');f.mudar('etapaId','');f.mudar('dataAcao','2026-10-02');
 const [acao,payload,controle]=await f.salvar();assert.equal(acao,'editarRegistro');assert.deepEqual(payload,{registroId:'acao-exemplo',tipo:'acao',titulo:'Entrega revisada de exemplo',texto:'Texto corrigido',resultado:'Resultado atualizado',proximoPasso:'Conferir versão',etapaId:'',dataAcao:'2026-10-02'});assert.deepEqual(controle,{versao:'v1'});
 assert.deepEqual(f.props.item,original);assert.ok(!nos(f.arvore).some(n=>n.type==='form'));
 for(const campo of ['por','nome','compartilhado','implantacao','revisoes','id'])assert.ok(!Object.hasOwn(payload,campo),campo);
});

test('permissão ausente ou falsa não expõe edição mesmo quando é possível contribuir',async()=>{
 const c=await componentes();
 for(const permitido of [undefined,false]){
  const saida=c.html(c.Acoes,{item:base({registros:[registro({podeEditar:permitido})]}),externo:true,executar(){},irArquivos(){}});
  assert.doesNotMatch(saida,/Editar ação:/);assert.match(saida,/Registrar ação/);
 }
 const leitura=c.html(c.Acoes,{item:base({podeContribuir:false,registros:[registro({podeEditar:false,podeAtualizar:false})]}),externo:true,executar(){},irArquivos(){}});
 assert.doesNotMatch(leitura,/Editar ação:|Registrar ação|Atualizar implantação/);assert.match(leitura,/Ver materiais/);
});

test('falha e conflito preservam campos digitados e permitem nova tentativa',async()=>{
 const chamadas=[];let sucesso=false;const f=await montar({executar:async(...args)=>{chamadas.push(args);return sucesso;}});
 f.clicar('Editar ação: Mapeamento fictício');f.mudar('texto','Não pode desaparecer');await f.salvar();
 assert.equal(f.procurar(n=>n.type===f.c.CamposRegistro).props.valor.texto,'Não pode desaparecer');assert.match(texto(f.arvore),/Seu texto foi mantido/);
 sucesso=true;await f.salvar();assert.equal(chamadas.length,2);assert.deepEqual(chamadas[0],chamadas[1]);assert.ok(!nos(f.arvore).some(n=>n.type==='form'));
});

test('falha inesperada mantém formulário, cancelamento não grava e revogação impede envio',async()=>{
 const f=await montar({executar:async()=>{throw new Error('conexão indisponível');}});f.clicar('Editar ação: Mapeamento fictício');f.mudar('titulo','Texto guardado');await f.salvar();assert.match(texto(f.arvore),/Não foi possível salvar/);assert.equal(f.procurar(n=>n.type===f.c.CamposRegistro).props.valor.titulo,'Texto guardado');
 f.clicar('Cancelar');assert.ok(!nos(f.arvore).some(n=>n.type==='form'));
 const g=await montar();g.clicar('Editar ação: Mapeamento fictício');g.mudar('texto','Rascunho preservado');g.props.item={...g.props.item,registros:[registro({podeEditar:false})]};g.render();
 assert.match(texto(g.arvore),/Seu acesso a este registro mudou/);assert.equal(g.procurar(n=>n.type===g.c.CamposRegistro).props.ocupado,true);await g.salvar();assert.equal(g.chamadas.length,0);
});

test('registro novo conserva contrato anterior incluindo implantação e compartilhamento',async()=>{
 const f=await montar({externo:false});f.clicar('Registrar ação');f.mudar('titulo','Novo teste');f.mudar('texto','Texto do teste');
 const checkbox=f.procurar(n=>n.type==='input'&&n.props.type==='checkbox');checkbox.props.onChange({target:{checked:true}});f.render();
 const [acao,payload]=await f.salvar();assert.equal(acao,'registro');assert.equal(payload.titulo,'Novo teste');assert.equal(payload.compartilhado,true);assert.deepEqual(payload.implantacao,{situacao:'nao_iniciada',como:'',data:''});assert.ok(!('registroId' in payload));
});

test('busca sem acentos e filtros de tipo, etapa e implantação se combinam sem modificar registros',async()=>{
 const {filtrarAcoes}=await componentes(),registros=[registro(),registro({id:'decisao',tipo:'decisao',titulo:'Aprovação fictícia',etapaId:'',resultado:'Escolha de exemplo',implantacao:undefined}),registro({id:'sem-info',titulo:'Visita técnica',etapaId:'',implantacao:undefined})],original=structuredClone(registros),etapas=base().etapas;
 assert.deepEqual(filtrarAcoes(registros,etapas,{busca:'APROVACAO',tipo:'decisao',etapa:'geral'}).map(r=>r.id),['decisao']);
 assert.deepEqual(filtrarAcoes(registros,etapas,{busca:'diagnostico',tipo:'acao',etapa:'etapa-exemplo',situacao:'em_implantacao'}).map(r=>r.id),['acao-exemplo']);
 assert.deepEqual(filtrarAcoes(registros,etapas,{situacao:'sem_informacao'}).map(r=>r.id),['sem-info']);
 assert.equal(filtrarAcoes(registros,etapas,{busca:'inexistente'}).length,0);assert.deepEqual(registros,original);
});

test('controles limpam busca e filtros e estado vazio explica como voltar',async()=>{
 const f=await montar();f.procurar(n=>n.props?.['aria-label']==='Buscar ações').props.onChange({target:{value:'Nada disso'}});f.render();assert.match(texto(f.arvore),/Nenhum registro encontrado/);assert.match(texto(f.arvore),/0 de 1 registro/);
 f.procurar(n=>n.props?.['aria-label']==='Filtrar por implantação').props.onChange({target:{value:'implantada'}});f.render();f.clicar('Limpar busca e filtros');assert.match(texto(f.arvore),/1 de 1 registro/);assert.doesNotMatch(texto(f.arvore),/Nenhum registro encontrado/);
});

test('histórico explica antes/depois, autor, data e valores retirados sem expor identificadores',async()=>{
 const c=await componentes(),r=registro({revisoes:[{em:'2026-10-02T12:00:00Z',nome:'Revisora de exemplo',por:'id-nao-publicar',antes:{titulo:'Título original',texto:'Texto original',dataAcao:'2026-10-01',etapaId:'etapa-exemplo',tipo:'acao'},depois:{titulo:'Título revisto',texto:'',dataAcao:'2026-10-02',etapaId:'',tipo:'decisao'}}]});
 const html=c.html(c.HistoricoRegistro,{registro:r,etapas:base().etapas});for(const esperado of ['Título original','Título revisto','Revisora de exemplo','Antes','Depois','Não informado','01/10/2026','02/10/2026','Diagnóstico de exemplo','Decisão'])assert.ok(html.includes(esperado),esperado);assert.doesNotMatch(html,/id-nao-publicar/);assert.match(html,/<details class="consultoria-revisoes"><summary>/);
});

test('Demandas preservam interface anterior e não recebem o editor de consultoria',async()=>{
 const c=await componentes(),html=c.html(c.Acoes,{item:base({tipo:'demanda'}),externo:false,executar(){},irArquivos(){}});
 assert.match(html,/processo-registros/);assert.match(html,/Anexar materiais/);assert.doesNotMatch(html,/consultoria-acoes-lista|Editar ação:/);
});

test('filtro e nova ação de Demandas usam tipos de registro, não situações de implantação',async()=>{
 const f=await montar({item:base({tipo:'demanda'}),externo:false});
 const valores=select=>[...f.c.html(()=>select,{}).matchAll(/<option value="([^"]*)"/g)].map(m=>m[1]);
 const filtro=f.procurar(n=>n.type==='select'&&n.props['aria-label']==='Filtrar registros');
 assert.deepEqual(valores(filtro),['todos','acao','atualizacao','decisao','pendencia']);
 f.clicar('+ Registrar ação');const tipo=f.procurar(n=>n.props?.nome==='Tipo de registro').props.children;
 assert.deepEqual(valores(tipo),['acao','atualizacao','decisao','pendencia']);
 tipo.props.onChange({target:{value:'decisao'}});f.render();const titulo=f.procurar(n=>n.props?.nome==='Título da ação').props.children;assert.equal(titulo.props.required,false);
});

test('formulário permite atualizar a data por input e preserva vínculo antigo sem inventar etapa',async()=>{
 const c=await componentes(),valor={tipo:'acao',titulo:'Teste',dataAcao:'2026-10-01',texto:'Teste',resultado:'',proximoPasso:'',etapaId:'legada'},mudancas=[];
 const arvore=c.CamposRegistro({valor,mudar:v=>mudancas.push(v),item:base(),ocupado:false}),input=nos(arvore).find(n=>n.props?.type==='date');input.props.onInput({currentTarget:{value:'2026-10-02'}});assert.equal(mudancas[0].dataAcao,'2026-10-02');assert.match(texto(arvore),/Etapa anterior não disponível/);assert.equal(valor.dataAcao,'2026-10-01');
});

test('edição de registro legado sem tipo permanece Andamento e não exige título ou data',async()=>{
 const legado=registro();delete legado.tipo;delete legado.titulo;delete legado.dataAcao;
 const f=await montar({item:base({registros:[legado]})});f.clicar('Editar ação: Texto original de exemplo');
 const campos=f.procurar(n=>n.type===f.c.CamposRegistro),valor=campos.props.valor;assert.equal(valor.tipo,'atualizacao');assert.equal(valor.titulo,'');assert.equal(valor.dataAcao,'');
 const arvore=f.c.CamposRegistro(campos.props),titulo=nos(arvore).find(n=>n.props?.nome==='Título da ação').props.children,data=nos(arvore).find(n=>n.props?.nome==='Data da ação').props.children;
 assert.equal(titulo.props.required,false);assert.equal(data.props.required,false);
 f.mudar('texto','Andamento revisto sem inventar data');const [acao,payload]=await f.salvar();assert.equal(acao,'editarRegistro');assert.equal(payload.tipo,'atualizacao');assert.equal(payload.titulo,'');assert.equal(payload.dataAcao,'');
});

test('mudança concorrente exige revisão explícita e combina campos sem sobrescrever silenciosamente',async()=>{
 const f=await montar();f.clicar('Editar ação: Mapeamento fictício');f.mudar('texto','Meu rascunho');
 f.props.item={...f.props.item,versao:'v2',registros:[registro({texto:'Texto salvo por outra pessoa',resultado:'Resultado recebido'})]};f.render();
 assert.match(texto(f.arvore),/A ficha foi atualizada/);assert.equal(f.procurar(n=>n.type==='button'&&texto(n)==='Salvar alterações').props.disabled,true);await f.salvar();assert.equal(f.chamadas.length,0);
 assert.equal(f.procurar(n=>n.type==='button'&&texto(n)==='Aplicar revisão ao rascunho').props.disabled,true);
 f.procurar(n=>n.type==='input'&&n.props.name==='conciliar-texto'&&n.props.checked===false).props.onChange();f.render();f.clicar('Aplicar revisão ao rascunho');
 const campos=f.procurar(n=>n.type===f.c.CamposRegistro).props.valor;assert.equal(campos.texto,'Texto salvo por outra pessoa');assert.equal(campos.resultado,'Resultado recebido');
 const [,payload,controle]=await f.salvar();assert.equal(payload.texto,'Texto salvo por outra pessoa');assert.equal(payload.resultado,'Resultado recebido');assert.deepEqual(controle,{versao:'v2'});
});

test('atualização de outro campo incorpora valor recebido e mantém rascunho após confirmação',async()=>{
 const f=await montar();f.clicar('Editar ação: Mapeamento fictício');f.mudar('texto','Meu texto permanece');f.props.item={...f.props.item,versao:'v2',registros:[registro({resultado:'Resultado recente'})]};f.render();
 assert.match(texto(f.arvore),/Nenhum campo foi alterado simultaneamente/);f.clicar('Aplicar revisão ao rascunho');
 const [,payload,controle]=await f.salvar();assert.equal(payload.texto,'Meu texto permanece');assert.equal(payload.resultado,'Resultado recente');assert.deepEqual(controle,{versao:'v2'});
});
