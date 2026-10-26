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
   import Ficha from './components/processos/FichaProcesso.jsx';
   import Resumo from './components/processos/ResumoProcesso.jsx';
   import ResumoDemanda from './components/processos/ResumoDemanda.jsx';
   import Acoes from './components/processos/AcoesProcesso.jsx';
   import Etapas from './components/processos/PlanoEtapas.jsx';
   import Acesso from './components/processos/AcessoConsultoria.jsx';
   import {resumoProcesso} from './lib/calc/resumoProcesso.js';
   export {React,Ficha,Resumo,ResumoDemanda,Acoes,Etapas,Acesso,resumoProcesso};
   export const html=(Componente,props)=>renderToStaticMarkup(<Componente {...props}/>);
  `,resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'esm',platform:'neutral',jsx:'automatic',conditions:['browser','import','default'],mainFields:['module','main'],loader:{'.css':'empty'},define:{'import.meta.env':'{"MODE":"test","BASE_URL":"/"}','process.env.NODE_ENV':'"production"'},logLevel:'silent'});
  pacote=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
 }
 return pacote;
}
const etapa=extras=>({id:'etapa-exemplo',titulo:'Conferir entrega fictícia',responsavelRhId:'rh-exemplo',prazo:'2099-05-12',situacao:'pendente',dependeDe:[],avaliacoes:[],...extras});
const registro={id:'registro-exemplo',tipo:'acao',titulo:'Ação de exemplo',texto:'Registro fictício',em:'2026-10-01T12:00:00Z',nome:'Pessoa de exemplo',implantacao:{situacao:'nao_iniciada'}};
const base=extras=>({id:'demanda-exemplo',tipo:'demanda',titulo:'Demanda de exemplo',situacao:'execucao',setor:'producao',prioridade:'alta',prazo:'2099-05-15',objetivo:'Objetivo de exemplo',responsavelRhId:'rh-exemplo',envolvidos:[{rhId:'rh-exemplo',nome:'Pessoa de exemplo',area:'Produção'}],etapas:[etapa()],registros:[registro],anexos:[{id:'arquivo-exemplo',nome:'Documento fictício',em:'2026-10-01T12:00:00Z',nomeAutor:'Pessoa de exemplo'}],historico:[{id:'historico-exemplo',acao:'Histórico preservado',nome:'Pessoa de exemplo',em:'2026-10-01T12:00:00Z'}],podeContribuir:true,podeGerir:true,versao:'v1',...extras});
const nos=e=>Array.isArray(e)?e.flatMap(nos):e&&typeof e==='object'?[e,...nos(e.props?.children)]:[];
const texto=e=>Array.isArray(e)?e.map(texto).join(''):e&&typeof e==='object'?texto(e.props?.children):String(e??'');
async function montar(props){
 const c=await componentes(),estados=[];let indice=0,arvore;
 const dispatcher={useState(inicial){const i=indice++;if(!(i in estados))estados[i]=typeof inicial==='function'?inicial():inicial;return [estados[i],v=>{estados[i]=typeof v==='function'?v(estados[i]):v;}];}};
 function render(){indice=0;const atual=c.React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.ReactCurrentDispatcher,antes=atual.current;atual.current=dispatcher;try{arvore=c.Ficha(props);}finally{atual.current=antes;}return arvore;}
 function botao(rotulo){const n=nos(arvore).find(n=>n.type==='button'&&texto(n)===rotulo);assert.ok(n,rotulo+' disponível');return n;}
 render();return {c,props,render,botao,get arvore(){return arvore;}};
}

test('resumo da demanda usa a próxima etapa real e preserva todos os sinais calculados',async()=>{
 const c=await componentes(),item=base({prazo:'2000-01-01',etapas:[etapa({id:'bloqueada',situacao:'bloqueada',prazo:'2000-01-01'}),etapa({id:'validar',titulo:'Entrega em conferência',situacao:'validacao',prazo:'2000-01-01'}),etapa({id:'dependente',titulo:'Etapa dependente',dependeDe:['bloqueada']}),etapa({id:'disponivel',titulo:'Etapa possível',situacao:'execucao'})],registros:[],anexos:[]});
 const hoje=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date()),r=c.resumoProcesso(item,hoje),arvore=c.ResumoDemanda({item,ir(){}}),saida=c.html(c.ResumoDemanda,{item,ir(){}});
 assert.equal(r.proxima.id,'disponivel');assert.match(saida,/Próxima etapa disponível/);assert.match(saida,/<h2>Etapa possível<\/h2>/);
 assert.match(saida,/Pessoa de exemplo/);assert.match(saida,/12\/05\/2099/);assert.match(saida,/Em execução/);
 for(const sinal of r.sinais)assert.ok(texto(arvore).includes(sinal.titulo),sinal.titulo);
 assert.doesNotMatch(saida,/Implantação e tempo|Progresso informado|Linha do tempo|Ações registradas|Etapa dependente/);
 const destinos=[];for(const botao of nos(c.ResumoDemanda({item,ir:aba=>destinos.push(aba)})).filter(n=>n.type==='button'))botao.props.onClick();
 assert.deepEqual(destinos,['etapas',...r.sinais.map(s=>s.aba)]);
});

test('demanda encerrada não recomenda trabalho novo nem expõe alertas de prazo antigos',async()=>{
 const c=await componentes();
 for(const situacao of ['concluida','cancelada']){
  const item=base({situacao,prazo:'2000-01-01',etapas:[etapa({situacao:'bloqueada',prazo:'2000-01-01'})],registros:[],anexos:[]}),arvore=c.ResumoDemanda({item,ir(){}}),saida=c.html(c.ResumoDemanda,{item,ir(){}});
  assert.match(saida,new RegExp('Demanda '+(situacao==='concluida'?'concluída':'cancelada')));assert.match(saida,/histórico, as ações e os materiais continuam disponíveis/);
  assert.doesNotMatch(saida,/Próxima etapa|prazo vencido|Registre o ponto|Reúna os materiais/);assert.equal(nos(arvore).filter(n=>n.type==='button').length,0);
 }
});

test('resumo vazio mantém instruções existentes e não inventa etapa, responsável ou prazo',async()=>{
 const c=await componentes(),saida=c.html(c.ResumoDemanda,{item:base({etapas:[],registros:[],anexos:[]}),ir(){}});
 assert.match(saida,/Plano de trabalho ainda não definido/);assert.match(saida,/Registre o ponto de partida/);assert.match(saida,/Reúna os materiais do trabalho/);
 assert.doesNotMatch(saida,/Próxima etapa disponível|Pessoa de exemplo|12\/05\/2099/);
});

test('cabeçalho identifica responsável e deixa objetivo e histórico recolhidos',async()=>{
 const c=await componentes(),saida=c.html(c.Ficha,{item:base(),aoAtualizar(){},aoEditar(){}});
 assert.match(saida,/class="processo-ficha space-y-3 demanda-ficha"/);assert.match(saida,/<dt>Responsável<\/dt><dd>Pessoa de exemplo<\/dd>/);assert.match(saida,/<dt>Prazo<\/dt><dd>15\/05\/2099<\/dd>/);
 assert.match(saida,/<details class="demanda-objetivo"><summary>Objetivo e detalhes<\/summary>/);assert.match(saida,/Objetivo de exemplo/);assert.match(saida,/Histórico preservado/);
 assert.doesNotMatch(saida,/<details[^>]*open[^>]*><summary[^>]*>(Objetivo e detalhes|Histórico do processo)/);
 assert.match(saida,/Ações · 1/);assert.match(saida,/Etapas · 1/);assert.match(saida,/Arquivos · 1/);
});

test('abas por URL e atalhos do resumo preservam a navegação controlada',async()=>{
 const mudanças=[],f=await montar({item:base(),abaInicial:'arquivos',aoMudarAba:aba=>mudanças.push(aba),aoAtualizar(){}});
 assert.equal(f.botao('Arquivos · 1').props['aria-pressed'],true);
 f.botao('Ações · 1').props.onClick();assert.deepEqual(mudanças,['acoes']);
 f.props.abaInicial='acoes';f.render();assert.equal(f.botao('Ações · 1').props['aria-pressed'],true);
 assert.equal(nos(f.arvore).find(n=>n.type==='div'&&n.props.children?.type===f.c.Acoes).props.hidden,false);
 f.props.abaInicial='resumo';f.render();nos(f.arvore).find(n=>n.type===f.c.Resumo).props.ir('etapas');assert.deepEqual(mudanças,['acoes','etapas']);
 f.props.abaInicial='etapas';f.render();assert.equal(f.botao('Etapas · 1').props['aria-pressed'],true);
 f.props.abaInicial='acesso';f.render();assert.equal(f.botao('Resumo').props['aria-pressed'],true);assert.ok(!nos(f.arvore).some(n=>n.type===f.c.Acesso));
});

test('navegação local conserva Ações e Etapas montadas e troca somente visibilidade',async()=>{
 const f=await montar({item:base(),aoAtualizar(){}}),envoltorio=tipo=>nos(f.arvore).find(n=>n.type==='div'&&n.props.children?.type===tipo);
 assert.equal(envoltorio(f.c.Acoes).props.hidden,true);assert.equal(envoltorio(f.c.Etapas).props.hidden,true);
 f.botao('Ações · 1').props.onClick();f.render();assert.equal(envoltorio(f.c.Acoes).props.hidden,false);assert.equal(envoltorio(f.c.Etapas).props.hidden,true);
 f.botao('Etapas · 1').props.onClick();f.render();assert.equal(envoltorio(f.c.Acoes).props.hidden,true);assert.equal(envoltorio(f.c.Etapas).props.hidden,false);
});

test('leitura preserva restrições de editar, cadastrar, anexar e administrar acessos',async()=>{
 const c=await componentes(),item=base({podeGerir:false,podeContribuir:false}),saida=c.html(c.Ficha,{item,aoAtualizar(){},aoEditar(){},abaInicial:'arquivos'});
 assert.doesNotMatch(saida,/Editar ficha e etapas|Registrar ação|Cadastrar etapa|type="file"|Pessoas e acessos/);assert.match(saida,/Documento fictício/);
 const completa=c.html(c.Ficha,{item:base(),aoAtualizar(){},aoEditar(){},abaInicial:'arquivos'});assert.match(completa,/Editar ficha e etapas/);assert.match(completa,/type="file"/);
});

test('consultoria conserva resumo detalhado, acesso autorizado e privacidade externa',async()=>{
 const c=await componentes(),item=base({tipo:'consultoria',empresa:'Consultoria de exemplo',podeAdministrarConsultoria:true,consultores:[],convites:[]});
 const resumo=c.html(c.Resumo,{item,ir(){}});assert.match(resumo,/Implantação e tempo|Progresso informado/);assert.match(resumo,/Ações registradas/);assert.doesNotMatch(resumo,/demanda-resumo/);
 const interna=await montar({item,aoAtualizar(){},abaInicial:'acesso'});assert.equal(interna.botao('Pessoas e acessos').props['aria-pressed'],true);assert.ok(nos(interna.arvore).some(n=>n.type===c.Acesso));assert.ok(!interna.arvore.props.className.includes('demanda-ficha'));
 const externa=await montar({item:{...item,envolvidos:undefined,historico:undefined,podeGerir:false,podeContribuir:false,podeAdministrarConsultoria:false},convite:'convite-ficticio',aoAtualizar(){}});
 assert.equal(externa.botao('Ações · 1').props['aria-pressed'],true);assert.doesNotMatch(texto(externa.arvore),/Pessoas envolvidas|Histórico do processo|Pessoas e acessos|Editar ficha/);
});
