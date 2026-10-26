import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {filtrarProcessos,selecionarProcessos} from '../src/lib/calc/processos-lista.js';

const require=createRequire(import.meta.url),{build}=createRequire(require.resolve('vite'))('esbuild');
let pacote;
async function componentes(){
 if(!pacote){
  const r=await build({stdin:{contents:`
   import React from 'react';
   import {renderToStaticMarkup} from 'react-dom/server.browser';
   import Central from './components/processos/CentralDemandas.jsx';
   export {Central};
   export const html=props=>renderToStaticMarkup(<Central {...props}/>);
  `,resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'jsx'},bundle:true,write:false,format:'esm',platform:'neutral',jsx:'automatic',conditions:['browser','import','default'],mainFields:['module','main'],loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
  pacote=await import('data:text/javascript;base64,'+Buffer.from(r.outputFiles[0].text).toString('base64'));
 }
 return pacote;
}
const hoje='2026-10-26';
const filtrosIniciais={busca:'',setor:'todos',responsavel:'todos',prioridade:'todas',fila:'abertos'};
const item=extras=>({id:'demanda-exemplo',tipo:'demanda',titulo:'Demanda de exemplo',situacao:'execucao',setor:'producao',prioridade:'normal',prazo:'',responsavelRhId:'rh-alfa',envolvidos:[{rhId:'rh-alfa',nome:'Pessoa Álfa'}],etapas:[],registros:[],anexos:[],...extras});
const etapa=extras=>({id:'etapa-exemplo',titulo:'Etapa de exemplo',situacao:'pendente',prazo:'2026-11-10',dependeDe:[],...extras});
const nos=e=>Array.isArray(e)?e.flatMap(nos):e&&typeof e==='object'?[e,...nos(e.props?.children)]:[];
const texto=e=>Array.isArray(e)?e.map(texto).join(''):e&&typeof e==='object'?texto(e.props?.children):String(e??'');
const classe=(no,nome)=>no.props?.className?.split(' ').includes(nome);
function props(itens=[],filtros={},extras={}){
 const atuais={...filtrosIniciais,...filtros},base=filtrarProcessos(itens,atuais);
 return {itens,base,visiveis:selecionarProcessos(base,atuais.fila,hoje),hoje,filtros:atuais,aoFiltro(){},aoLimpar(){},aoAbrir(){},aoAtualizar(){},carregando:false,...extras};
}
const botao=(arvore,rotulo)=>{const n=nos(arvore).find(n=>n.type==='button'&&(n.props['aria-label']===rotulo||texto(n)===rotulo));assert.ok(n,rotulo+' disponível');return n;};
const cartoes=arvore=>nos(arvore).filter(n=>n.type==='article'&&classe(n,'demanda-cartao'));

test('contagem de cada fila parte da base filtrada sem limitar pela fila selecionada',async()=>{
 const {Central}=await componentes(),comum={titulo:'Ciclo fictício',prioridade:'alta'},itens=[
  item({...comum,id:'atrasada',prazo:'2026-10-01'}),
  item({...comum,id:'validacao',situacao:'validacao',etapas:[etapa({situacao:'validacao',prazo:'2026-10-01'})]}),
  item({...comum,id:'concluida',situacao:'concluida',prazo:'2026-10-01'}),
  item({...comum,id:'outro-setor',setor:'financeiro',prazo:'2026-10-01'}),
  item({...comum,id:'outro-responsavel',responsavelRhId:'rh-beta',envolvidos:[{rhId:'rh-beta',nome:'Pessoa Beta'}],prazo:'2026-10-01'}),
  item({...comum,id:'outra-prioridade',prioridade:'normal',prazo:'2026-10-01'}),
  item({...comum,id:'outro-assunto',titulo:'Assunto diferente',prazo:'2026-10-01'}),
 ],p=props(itens,{busca:'ciclo',setor:'producao',responsavel:'rh-alfa',prioridade:'alta',fila:'atrasados'}),arvore=Central(p),nav=nos(arvore).find(n=>n.type==='nav');
 assert.deepEqual(p.base.map(x=>x.id),['atrasada','validacao','concluida']);assert.equal(p.visiveis.length,1);
 const filas=nos(nav).filter(n=>n.type==='button');
 assert.deepEqual(filas.map(n=>texto(n.props.children[0])),['Em aberto','Atrasadas','Para validar','Concluídas']);
 assert.deepEqual(filas.map(n=>texto(n.props.children[1])),['2','1','1','1']);
 assert.deepEqual(filas.map(n=>n.props['aria-pressed']),[false,true,false,false]);assert.equal(cartoes(arvore).length,1);
});

test('prazo vencido mantém a situação real e usa o próximo prazo registrado',async()=>{
 const {Central,html}=await componentes(),p=props([item({prazo:'2026-11-20',etapas:[etapa({prazo:'2026-10-10'})]})]),arvore=Central(p),cartao=cartoes(arvore)[0],saida=html(p);
 assert.ok(classe(cartao,'demanda-atrasada'));assert.match(saida,/estado-execucao[^>]*>Em execução/);assert.match(saida,/Próximo prazo/);assert.match(saida,/10\/10\/2026/);assert.match(saida,/Prazo vencido/);
 assert.equal(nos(cartao).find(n=>classe(n,'demanda-estado')).props.children,'Em execução');
});

test('concluída e cancelada não exibem atraso nem bloqueio operacional antigos',async()=>{
 const {Central}=await componentes();
 for(const situacao of ['concluida','cancelada']){
  const arvore=Central(props([item({situacao,prazo:'2026-10-05',etapas:[etapa({situacao:'bloqueada',prazo:'2026-10-01'})]})],{fila:'todos'})),cartao=cartoes(arvore)[0];
  assert.ok(!classe(cartao,'demanda-atrasada'));assert.match(texto(cartao),/Prazo da demanda05\/10\/2026/);
  assert.doesNotMatch(texto(cartao),/Prazo vencido|Próximo prazo|para validar|bloqueada/);
  assert.equal(nos(cartao).find(n=>classe(n,'demanda-estado')).props.children,situacao==='concluida'?'Concluída':'Cancelada');
 }
});

test('etapa pronta para validação não vira atraso de execução e mantém a contagem de conclusão',async()=>{
 const {Central}=await componentes(),arvore=Central(props([item({etapas:[etapa({situacao:'validacao',prazo:'2026-10-01'}),etapa({id:'validada',situacao:'concluida'})]})])),cartao=cartoes(arvore)[0];
 assert.ok(!classe(cartao,'demanda-atrasada'));assert.doesNotMatch(texto(cartao),/Prazo vencido/);assert.match(texto(cartao),/1\/2 etapas concluídas/);assert.match(texto(cartao),/1 para validar/);
});

test('demanda sem etapas ou prazo não inventa percentual nem conclusão',async()=>{
 const {Central}=await componentes(),arvore=Central(props([item({envolvidos:[]})])),cartao=cartoes(arvore)[0];
 assert.equal(nos(cartao).filter(n=>classe(n,'demanda-progresso')).length,0);assert.doesNotMatch(texto(cartao),/0\/0|100%|etapas concluídas/);
 assert.match(texto(cartao),/Sem prazo/);assert.match(texto(cartao),/Responsável não informado/);
});

test('busca, seletores, filas e remoção individual enviam os filtros corretos',async()=>{
 const {Central}=await componentes(),chamadas=[],itens=[item(),item({id:'segunda',responsavelRhId:'rh-beta',envolvidos:[{rhId:'rh-beta',nome:'Pessoa Beta'},{rhId:'participante',nome:'Pessoa apenas envolvida'}]})],arvore=Central(props(itens,{setor:'producao',responsavel:'rh-alfa',prioridade:'alta'},{aoFiltro:(...args)=>chamadas.push(args)}));
 nos(arvore).find(n=>n.type==='input'&&n.props['aria-label']==='Buscar demandas').props.onChange({target:{value:'novo assunto'}});
 for(const [rotulo,valor] of [['Setor','financeiro'],['Responsável','rh-beta'],['Prioridade','urgente']]){
  const label=nos(arvore).find(n=>n.type==='label'&&n.props.children?.[0]===rotulo);assert.ok(label,rotulo+' disponível');
  nos(label).find(n=>n.type==='select').props.onChange({target:{value:valor}});
 }
 const nav=nos(arvore).find(n=>n.type==='nav');for(const n of nos(nav).filter(n=>n.type==='button'))n.props.onClick();
 const mais=nos(arvore).find(n=>n.type==='select'&&n.props['aria-label']==='Mais situações');mais.props.onChange({target:{value:''}});mais.props.onChange({target:{value:'bloqueados'}});
 for(const rotulo of ['Remover filtro: Produção','Remover filtro: Pessoa Álfa','Remover filtro: Prioridade Alta'])botao(arvore,rotulo).props.onClick();
 assert.deepEqual(chamadas,[['busca','novo assunto'],['setor','financeiro'],['responsavel','rh-beta'],['prioridade','urgente'],['fila','abertos'],['fila','atrasados'],['fila','validacao'],['fila','concluida'],['fila','bloqueados'],['setor','todos'],['responsavel','todos'],['prioridade','todas']]);
 const responsaveis=nos(arvore).find(n=>n.type==='label'&&n.props.children?.[0]==='Responsável');assert.doesNotMatch(texto(responsaveis),/Pessoa apenas envolvida/);
 const detalhes=nos(arvore).find(n=>n.type==='details');assert.equal(detalhes.props.open,undefined);
});

test('abrir demanda envia o ID correto e atualização respeita carregamento',async()=>{
 const {Central}=await componentes(),abertos=[];let atualizacoes=0,limpezas=0;
 const itens=[item({id:'primeira',titulo:'Primeira demanda'}),item({id:'segunda',titulo:'Segunda demanda'})],p=props(itens,{busca:'demanda'},{aoAbrir:id=>abertos.push(id),aoAtualizar:()=>atualizacoes++,aoLimpar:()=>limpezas++}),arvore=Central(p);
 assert.deepEqual(abertos,[]);botao(arvore,'Abrir demanda: Segunda demanda').props.onClick();assert.deepEqual(abertos,['segunda']);
 assert.equal(nos(cartoes(arvore)[0]).filter(n=>n.type==='button').length,1);assert.equal(cartoes(arvore)[0].props.onClick,undefined);
 botao(arvore,'Atualizar').props.onClick();botao(arvore,'Limpar filtros').props.onClick();assert.equal(atualizacoes,1);assert.equal(limpezas,1);
 assert.equal(botao(Central({...p,carregando:true}),'Atualizar').props.disabled,true);
});

test('vazio distingue ausência de registros, filtro sem resultado e carregamento',async()=>{
 const {Central}=await componentes(),primeira=Central(props());assert.match(texto(primeira),/Organize sua primeira demanda/);assert.doesNotMatch(texto(primeira),/Nenhuma demanda nesta seleção|Limpar filtros|Ver demandas em aberto/);
 let limpezas=0;const filtrada=Central(props([item()],{busca:'inexistente'},{aoLimpar:()=>limpezas++}));assert.match(texto(filtrada),/Nenhuma demanda nesta seleção/);assert.doesNotMatch(texto(filtrada),/Organize sua primeira demanda/);assert.equal(cartoes(filtrada).length,0);
 botao(filtrada,'Ver demandas em aberto').props.onClick();assert.equal(limpezas,1);
 const carregando=Central(props([],{},{carregando:true}));assert.doesNotMatch(texto(carregando),/Organize sua primeira demanda|Nenhuma demanda nesta seleção/);
 const encerradas=Central(props([item({situacao:'concluida'})]));assert.match(texto(encerradas),/Nenhuma demanda nesta seleção/);assert.doesNotMatch(texto(encerradas),/Organize sua primeira demanda/);
});
