import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite'))('esbuild');
const SRC=fileURLToPath(new URL('../src/',import.meta.url));
let carregada;
async function componentes(){
 if(!carregada){
  const saida=await build({stdin:{contents:`
   import React from 'react';
   import {renderToStaticMarkup} from 'react-dom/server.browser';
   import {MemoryRouter} from 'react-router-dom';
   import Comercial from './pages/Comercial.jsx';
   import Relacionamento from './components/comercial/RelacionamentoComercial.jsx';
   import Acao from './components/comercial/AcaoComercial.jsx';
   export {React,Acao};
   export const renderizar=(caminho)=>renderToStaticMarkup(React.createElement(MemoryRouter,{initialEntries:[caminho]},React.createElement(Comercial,{sessao:{usuario:'exemplo',permissoes:['orcamentos']}})));
   export const relacao=(dados)=>renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(Relacionamento,{dados,abrirAcao:()=>{},abrirCliente:()=>{}})));
  `,resolveDir:SRC,loader:'jsx'},bundle:true,format:'esm',platform:'neutral',write:false,logLevel:'silent',jsx:'automatic',mainFields:['module','main'],conditions:['browser','import','default'],loader:{'.css':'empty','.png':'empty','.webp':'empty','.ttf':'empty'},define:{'import.meta.env':'{"MODE":"test"}','process.env.NODE_ENV':'"production"'},plugins:[{name:'sem-rede-comercial',setup(b){b.onLoad({filter:/\/services\/comercial\.js$/},()=>({contents:'export const chamarComercial=(action,dados)=>globalThis.__posVendaUiService(action,dados);',loader:'js'}));}}]});
  carregada=await import('data:text/javascript;base64,'+Buffer.from(saida.outputFiles[0].text).toString('base64'));
 }
 return carregada;
}
const base=()=>({escopo:{gestor:true,vendedorId:'consultora-exemplo'},catalogo:{vendedores:[{id:'consultora-exemplo',nome:'Consultora exemplo'}]},base:{acoes:[],clientes:[{id:'cliente-exemplo',nome:'Cliente exemplo'}],orcamentos:[],coberturaHistorica:{completo:true}},relatorio:{hoje:'2026-10-15',clientes:[],sugestoesReativacao:[]}});
const inicial={id:'acao-exemplo',versao:2,clienteId:'cliente-exemplo',cliente:'Cliente exemplo',vendedorId:'consultora-exemplo',tipoAcao:'pos_venda',ordemId:'pedido-exemplo',objetivo:'Conferir a entrega',descricao:'Retornar ao cliente',data:'2026-10-20',status:'pendente',resultado:'Resultado anterior',nota:'Observação anterior',relatoAtendimento:'Relato anterior'};
const filhos=e=>Array.isArray(e)?e.flatMap(filhos):e&&typeof e==='object'?[e,...filhos(e.props?.children)]:[];
const texto=e=>Array.isArray(e)?e.map(texto).join(''):e&&typeof e==='object'?texto(e.props?.children):String(e??'');
async function formulario(entrada=inicial,dados=base()){
 const {React,Acao}=await componentes(),valores=[],efeitos=[];
 let indice=0,arvore;
 // Executa os handlers reais do formulário. Efeitos ficam suspensos até uma
 // consulta controlada; validarContato é real e só a fronteira HTTP foi substituída.
 const dispatcher={useState(init){const i=indice++;if(!(i in valores))valores[i]=typeof init==='function'?init():init;return[valores[i],v=>{valores[i]=typeof v==='function'?v(valores[i]):v;}];},useRef(init){const i=indice++;if(!(i in valores))valores[i]={current:init};return valores[i];},useEffect(fn){indice++;efeitos.push(fn);}};
 function render(){indice=0;const atual=React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher;const antes=atual.current;atual.current=dispatcher;try{arvore=Acao({inicial:entrada,dados,filtro:{vendedor:'consultora-exemplo'},salvo(){},fechar(){}});}finally{atual.current=antes;}return arvore;}
 function achar(tipo,rotulo){const n=filhos(arvore).find(x=>x.type===tipo&&texto(x).startsWith(rotulo));assert.ok(n,`${tipo} ${rotulo} deve estar disponível`);return n;}
 function campo(rotulo){return filhos(achar('label',rotulo)).find(x=>['input','textarea','select'].includes(x.type));}
 render();return {render,achar,campo,get arvore(){return arvore;},alterar(rotulo,value){campo(rotulo).props.onChange({target:{value}});render();},clicar(rotulo){achar('button',rotulo).props.onClick();render();},async ativar(rotulo){const botao=achar('button',rotulo),evento={preventDefault(){}};assert.equal(!!botao.props.disabled,false);if(botao.props.onClick)await botao.props.onClick(evento);else if(botao.props.type!=='button')await achar('form','').props.onSubmit(evento);render();},async enviar(){await achar('form','').props.onSubmit({preventDefault(){}});render();},async carregarContexto(ctx){globalThis.__posVendaUiService=async(action)=>{assert.equal(action,'contextoRelacionamento');return ctx;};efeitos.splice(0).forEach(fn=>fn());await new Promise(resolve=>setImmediate(resolve));render();}};
}

test('navegação separa prospecção e pós-venda e resolve entradas antigas',async()=>{
 const {renderizar}=await componentes();
 for(const [query,selecionada] of [['aba=prospeccao','Prospecção'],['aba=pos_venda','Pós-venda'],['aba=relacionamento','Prospecção'],['aba=relacionamento&relacao_tipo=pos_venda','Pós-venda'],['aba=relacionamento&pos_venda=1','Pós-venda']]){
  const html=renderizar(`/comercial?de=2026-09-01&ate=2026-09-30&vendedor=consultora-exemplo&${query}`),nav=html.match(/<nav[^>]*aria-label="Área Comercial"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
  assert.match(nav,/<button[^>]*>Prospecção<\/button>/);assert.match(nav,/<button[^>]*>Pós-venda<\/button>/);assert.match(nav,new RegExp(`<button[^>]*aria-current="page"[^>]*>${selecionada}<\\/button>`));
  assert.match(html,/value="2026-09-01"/);assert.match(html,/value="2026-09-30"/);
 }
});

test('prospecção exclui os atendimentos de pós-venda da lista e dos contadores',async()=>{
 const {relacao}=await componentes(),dados=base();
 dados.base.acoes=[{...inicial,id:'prospeccao-exemplo',tipoAcao:'prospeccao',cliente:'Cliente em prospecção'},{...inicial,id:'pos-venda-exemplo',cliente:'Cliente com pós-venda'}];
 const html=relacao(dados);assert.match(html,/Cliente em prospecção/);assert.doesNotMatch(html,/Cliente com pós-venda|Pós-venda após entrega|Prospecção e pós-venda/);assert.match(html,/Abertas<span>1<\/span>/);
});

test('novo contato de pós-venda exige descrição vazia do que foi feito, sem reaproveitar relato',async()=>{
 const f=await formulario({...inicial,registroRapido:true}),relato=f.campo('O que você fez?');
 assert.equal(relato.type,'textarea');assert.equal(relato.props.required,true);assert.equal(relato.props.maxLength,3000);assert.equal(relato.props.value,'');
 f.alterar('O que você fez?','Conferi a instalação com o cliente.');f.clicar('Planejar / editar ação');f.clicar('Registrar contato');assert.equal(f.campo('O que você fez?').props.value,'');
});

test('registrar e finalizar conclui pós-venda aberto em uma única gravação com relato e vínculo preservado',async()=>{
 const chamadas=[];globalThis.__posVendaUiService=async(action,payload)=>{chamadas.push({action,payload});return {};};
 const f=await formulario({...inicial,registroRapido:true});assert.equal(chamadas.length,0);assert.equal(f.campo('Situação').props.value,'pendente');
 f.alterar('O que você fez?','Conferi a instalação e registrei o retorno do cliente.');f.alterar('Resultado confirmado','avaliando');await f.ativar('Registrar e finalizar');
 assert.equal(chamadas.length,1);assert.equal(chamadas[0].action,'salvarAcao');
 const {acao,versao,filtro}=chamadas[0].payload;
 assert.equal(acao.status,'concluida');assert.equal(acao.confirmarContato,true);assert.equal(acao.relatoAtendimento,'Conferi a instalação e registrei o retorno do cliente.');assert.equal(acao.resultadoContato,'avaliando');
 assert.equal(acao.id,'acao-exemplo');assert.equal(acao.clienteId,'cliente-exemplo');assert.equal(acao.ordemId,'pedido-exemplo');assert.equal(acao.vendedorId,'consultora-exemplo');assert.equal(versao,2);assert.equal(filtro.vendedor,'consultora-exemplo');
});

test('registrar e continuar e envio normal mantêm o pós-venda aberto com o próximo passo',async()=>{
 for(const acionar of [f=>f.ativar('Registrar e continuar'),f=>f.enviar()]){
  const chamadas=[];globalThis.__posVendaUiService=async(action,payload)=>{chamadas.push({action,payload});return {};};
  const f=await formulario({...inicial,registroRapido:true});f.alterar('O que você fez?','Conferi o pedido e combinei uma nova revisão.');f.alterar('Resultado confirmado','avaliando');await acionar(f);
  assert.equal(chamadas.length,1);assert.equal(chamadas[0].payload.acao.status,'pendente');assert.equal(chamadas[0].payload.acao.confirmarContato,true);assert.equal(chamadas[0].payload.acao.descricao,'Retornar ao cliente');assert.equal(chamadas[0].payload.acao.data,'2026-10-20');
 }
});

test('finalizar exige relato e resultado novos e cancelar não grava o atendimento',async()=>{
 for(const ausente of ['relato','resultado']){
  const chamadas=[];globalThis.__posVendaUiService=async(action,payload)=>{chamadas.push({action,payload});return {};};
  const f=await formulario({...inicial,registroRapido:true});
  if(ausente!=='relato')f.alterar('O que você fez?','Conferi o acabamento com o cliente.');
  if(ausente!=='resultado')f.alterar('Resultado confirmado','avaliando');
  await f.ativar('Registrar e finalizar');assert.equal(chamadas.length,0);assert.match(texto(f.arvore),ausente==='relato'?/o que você fez|relato/i:/resultado do contato/i);
  assert.equal(f.campo('Situação').props.value,'pendente');f.clicar('Cancelar');assert.equal(chamadas.length,0);
 }
});

test('continuar exige próximo passo e concluir não é disparado ao abrir ou cancelar',async()=>{
 const chamadas=[];globalThis.__posVendaUiService=async(action,payload)=>{chamadas.push({action,payload});return {};};
 const f=await formulario({...inicial,registroRapido:true});assert.equal(chamadas.length,0);
 f.alterar('O que você fez?','Conferi a instalação com o cliente.');f.alterar('Resultado confirmado','avaliando');f.alterar('Próxima ação','');
 await f.ativar('Registrar e continuar');assert.equal(chamadas.length,0);assert.match(texto(f.arvore),/próximo passo/i);
 f.clicar('Cancelar');assert.equal(chamadas.length,0);
});

test('atendimento já concluído oferece finalizar sem continuar e planejamento preserva edição',async()=>{
 const chamadas=[];globalThis.__posVendaUiService=async(action,payload)=>{chamadas.push({action,payload});return {};};
 const f=await formulario({...inicial,status:'concluida',registroRapido:true});
 assert.ok(!filhos(f.arvore).some(x=>x.type==='button'&&texto(x)==='Registrar e continuar'));
 f.alterar('O que você fez?','Conferi o atendimento encerrado com o cliente.');f.alterar('Resultado confirmado','avaliando');await f.ativar('Registrar e finalizar');
 assert.equal(chamadas.length,1);assert.equal(chamadas[0].payload.acao.status,'concluida');assert.equal(chamadas[0].payload.acao.confirmarContato,true);
 const planejamento=await formulario();await planejamento.ativar('Salvar ação');assert.equal(chamadas.length,2);assert.equal(chamadas[1].payload.acao.status,'pendente');assert.equal(chamadas[1].payload.acao.confirmarContato,false);
 const outro=await formulario({...inicial,tipoAcao:'prospeccao',registroRapido:true});assert.ok(!filhos(outro.arvore).some(x=>x.type==='button'&&texto(x)==='Registrar e finalizar'));outro.alterar('Resultado confirmado','avaliando');await outro.ativar('Confirmar contato e próximo passo');assert.equal(chamadas.length,3);assert.equal(chamadas[2].payload.acao.tipoAcao,'prospeccao');assert.equal(chamadas[2].payload.acao.status,'pendente');
});

test('concluir pós-venda no planejamento abre confirmação e não permite salvar sem novo relato',async()=>{
 const chamadas=[];globalThis.__posVendaUiService=async(action,payload)=>{chamadas.push({action,payload});return {};};
 const f=await formulario();f.alterar('Situação','concluida');
 assert.equal(f.achar('button','Registrar contato').props['aria-pressed'],true);assert.equal(f.campo('O que você fez?').props.value,'');
 f.alterar('Resultado confirmado','avaliando');await f.enviar();assert.equal(chamadas.length,0);assert.match(texto(f.arvore),/o que você fez|o que foi feito|relato/i);
 f.alterar('O que você fez?','Conferi o acabamento e registrei o retorno do cliente.');await f.enviar();
 assert.equal(chamadas.length,1);assert.equal(chamadas[0].action,'salvarAcao');assert.equal(chamadas[0].payload.acao.confirmarContato,true);assert.equal(chamadas[0].payload.acao.relatoAtendimento,'Conferi o acabamento e registrei o retorno do cliente.');
});

test('reagendar pós-venda não confirma atendimento e histórico conserva relato, resultado e autoria',async()=>{
 const chamadas=[];globalThis.__posVendaUiService=async(action,payload)=>{chamadas.push({action,payload});return {};};
 const dados=base();dados.base.acoes=[{...inicial,contatos:[{em:'2026-10-14T15:00:00Z',autor:'Consultora exemplo',resultadoContato:'avaliando',resultado:'Está avaliando',nota:'Observação do atendimento',relatoAtendimento:'Conferi as peças com o cliente.'}]}];
 const f=await formulario(inicial,dados);f.alterar('Data do retorno','2026-10-22');await f.enviar();
 assert.equal(chamadas.length,1);assert.equal(chamadas[0].payload.acao.confirmarContato,false);assert.match(texto(f.arvore),/O que foi feito/);assert.match(texto(f.arvore),/Conferi as peças com o cliente/);assert.match(texto(f.arvore),/Observação do atendimento/);assert.match(texto(f.arvore),/Consultora exemplo/);assert.match(texto(f.arvore),/Relato anterior/);
});

test('editar pós-venda que já estava concluído preserva o atendimento sem exigir outro contato',async()=>{
 const chamadas=[];globalThis.__posVendaUiService=async(action,payload)=>{chamadas.push({action,payload});return {};};
 const concluida={...inicial,status:'concluida'},f=await formulario(concluida);
 f.alterar('Estratégia para o cliente','Planejar soluções futuras.');await f.enviar();
 assert.equal(chamadas.length,1);assert.equal(chamadas[0].payload.acao.confirmarContato,false);assert.equal(chamadas[0].payload.acao.status,'concluida');
});

const contexto=()=>({cliente:{id:'cliente-exemplo',nome:'Cliente exemplo'},autorizado:true,orcamentos:[],vendas:[{id:'pedido-exemplo',numero:'EXEMPLO',data:'2026-10-10',entregaRealEm:'2026-10-12T12:00:00Z',elegivelPosVenda:true}],acoes:[],paginacao:{temMais:false}});

test('pós-venda salvo mantém tipo, cliente e O.S. originais e permite editar prazo',async()=>{
 const f=await formulario();await f.carregarContexto(contexto());
 assert.equal(f.campo('Tipo de ação').props.disabled,true);assert.equal(f.campo('Pedido / O.S.').props.disabled,true);
 assert.match(texto(f.arvore),/Vinculado à O\.S\. original; edite a ação e o prazo\./);
 assert.ok(!filhos(f.arvore).some(x=>x.type==='button'&&['Trocar cliente','Acompanhar pedido em andamento'].includes(texto(x))));
 f.alterar('Tipo de ação','acompanhamento');f.alterar('Pedido / O.S.','outro-pedido-exemplo');
 assert.equal(f.campo('Tipo de ação').props.value,'pos_venda');assert.equal(f.campo('Pedido / O.S.').props.value,'pedido-exemplo');
 f.alterar('Data do retorno','2026-10-27');assert.equal(f.campo('Data do retorno').props.value,'2026-10-27');
});

test('ação de outro tipo já salva não oferece conversão para pós-venda',async()=>{
 const f=await formulario({...inicial,tipoAcao:'acompanhamento'}),tipo=f.campo('Tipo de ação');
 assert.equal(!!tipo.props.disabled,false);assert.equal(filhos(tipo).find(x=>x.type==='option'&&x.props.value==='pos_venda').props.disabled,true);
 assert.match(texto(f.arvore),/crie.*aba Pós-venda/i);
 f.alterar('Tipo de ação','pos_venda');assert.equal(f.campo('Tipo de ação').props.value,'acompanhamento');
 f.alterar('Tipo de ação','relacionamento');assert.equal(f.campo('Tipo de ação').props.value,'relacionamento');
});

test('ação nova permite escolher pós-venda e O.S. antes do primeiro salvamento',async()=>{
 const f=await formulario({...inicial,versao:undefined,tipoAcao:'acompanhamento'});await f.carregarContexto(contexto());
 assert.equal(!!f.campo('Tipo de ação').props.disabled,false);assert.equal(!!filhos(f.campo('Tipo de ação')).find(x=>x.type==='option'&&x.props.value==='pos_venda').props.disabled,false);
 f.alterar('Tipo de ação','pos_venda');assert.equal(f.campo('Tipo de ação').props.value,'pos_venda');assert.equal(!!f.campo('Pedido / O.S.').props.disabled,false);
 f.alterar('Pedido / O.S.','outro-pedido-exemplo');assert.equal(f.campo('Pedido / O.S.').props.value,'outro-pedido-exemplo');
});

const carteira=()=>{const d=base();d.catalogo.vendedores.push({id:'outra-consultora-exemplo',nome:'Outra consultora exemplo'});return d;};

test('pós-venda novo e salvo fixam o responsável ao vendedor da O.S.',async()=>{
 for(const versao of [undefined,2]){
  const f=await formulario({...inicial,versao},carteira());
  assert.equal(f.campo('Responsável').props.disabled,true);assert.match(texto(f.arvore),/O pós-venda acompanha o vendedor original da O\.S\./);
  assert.ok(filhos(f.campo('Responsável')).filter(x=>x.type==='option').every(x=>!x.props.value||x.props.value==='consultora-exemplo'));
  f.alterar('Responsável','outra-consultora-exemplo');assert.equal(f.campo('Responsável').props.value,'consultora-exemplo');
 }
});

test('novo pós-venda usa o vendedor original ao selecionar a O.S. por ID ou nome exato',async()=>{
 for(const venda of [{vendedorId:'consultora-exemplo'},{vendedorErpId:'consultora-exemplo'},{vendedorNome:'Consultora exemplo'}]){
  const f=await formulario({...inicial,versao:undefined,ordemId:'',vendedorId:'outra-consultora-exemplo'},carteira()),ctx=contexto();Object.assign(ctx.vendas[0],venda);await f.carregarContexto(ctx);
  f.alterar('Pedido / O.S.','pedido-exemplo');assert.equal(f.campo('Responsável').props.value,'consultora-exemplo');
 }
});

test('escolher pós-venda com O.S. já vinculada preenche vendedor sem alterar outros tipos',async()=>{
 const f=await formulario({...inicial,versao:undefined,tipoAcao:'acompanhamento',vendedorId:'outra-consultora-exemplo'},carteira()),ctx=contexto();ctx.vendas[0].vendedorId='consultora-exemplo';await f.carregarContexto(ctx);
 assert.equal(f.campo('Responsável').props.value,'outra-consultora-exemplo');assert.equal(!!f.campo('Responsável').props.disabled,false);
 f.alterar('Tipo de ação','pos_venda');assert.equal(f.campo('Responsável').props.value,'consultora-exemplo');assert.equal(f.campo('Responsável').props.disabled,true);
 f.alterar('Tipo de ação','relacionamento');f.alterar('Responsável','outra-consultora-exemplo');assert.equal(f.campo('Responsável').props.value,'outra-consultora-exemplo');
});

test('direção corrige legado divergente para vendedor original somente por ação explícita',async()=>{
 const f=await formulario({...inicial,vendedorId:'outra-consultora-exemplo'},carteira()),ctx=contexto();ctx.vendas[0].vendedorId='consultora-exemplo';await f.carregarContexto(ctx);
 assert.equal(f.campo('Responsável').props.value,'outra-consultora-exemplo');
 const chamadas=[];globalThis.__posVendaUiService=async(action,payload)=>{chamadas.push({action,payload});return {};};
 f.clicar('Usar vendedor da O.S.');assert.equal(f.campo('Responsável').props.value,'consultora-exemplo');assert.equal(chamadas.length,0);
 await f.enviar();assert.equal(chamadas.length,1);assert.equal(chamadas[0].payload.acao.vendedorId,'consultora-exemplo');
 const dados=carteira();dados.escopo.gestor=false;const restrito=await formulario({...inicial,vendedorId:'outra-consultora-exemplo'},dados);await restrito.carregarContexto(ctx);assert.ok(!filhos(restrito.arvore).some(x=>x.type==='button'&&texto(x)==='Usar vendedor da O.S.'));
});

test('pós-venda novo de O.S. antiga usa o nome original mesmo fora da primeira página e de outro escopo',async()=>{
 const dados=carteira();dados.escopo.vendedorId='outra-consultora-exemplo';
 const f=await formulario({...inicial,versao:undefined,ordemId:'pedido-antigo-exemplo',vendedorId:null,vendedorNome:'Consultora exemplo'},dados),ctx=contexto();
 assert.equal(f.campo('Responsável').props.value,'consultora-exemplo');
 await f.carregarContexto(ctx);assert.equal(f.campo('Responsável').props.value,'consultora-exemplo');assert.equal(f.campo('Responsável').props.disabled,true);
});
