import {after, before, test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const require=createRequire(import.meta.url);
const raiz=fileURLToPath(new URL('..',import.meta.url));
const componentes=path.join(raiz,'src/components/patrimonio');
const globais={window:globalThis.window,localStorage:globalThis.localStorage};
let pasta,Formulario,DetalheCarregando,DetalheLido;

async function compilar(nome,{detalhe=false,leituraConcluida=false}={}) {
  let fonte=await readFile(path.join(componentes,nome),'utf8');
  // O componente de detalhe é interno. A instrumentação só o exporta no
  // bundle temporário de teste; nenhuma API de produção é acrescentada.
  if(detalhe)fonte+='\nexport {ManualDetalhe};\n';
  if(leituraConcluida){
    const inicial='[carregando,setCarregando]=useState(true)';
    assert.equal(fonte.split(inicial).length,2,'A leitura concluída deve substituir um único estado inicial.');
    fonte=fonte.replace(inicial,'[carregando,setCarregando]=useState(false)');
  }
  const resultado=await build({
    stdin:{contents:fonte,resolveDir:componentes,loader:'jsx'},
    bundle:true,write:false,format:'cjs',platform:'node',jsx:'automatic',
    define:{'import.meta.env.MODE':'"review"','import.meta.env':'{}'},
    plugins:[{name:'react-compartilhado',setup(b){
      b.onResolve({filter:/^react(?:-dom|-router-dom)?(?:\/.*)?$/},a=>({path:require.resolve(a.path),external:true}));
      b.onLoad({filter:/\.css$/},()=>({contents:'',loader:'empty'}));
    }}],
  });
  const arquivo=path.join(pasta,`${nome}-${leituraConcluida?'lido':'inicial'}.cjs`);
  await writeFile(arquivo,resultado.outputFiles[0].text);
  return require(arquivo);
}

before(async()=>{
  pasta=await mkdtemp(path.join(tmpdir(),'manuais-maquinas-ui-'));
  // Perfil apenas de consulta, com a mesma projeção permitida aos operadores.
  globalThis.window={location:{search:'?perfil=empresa'}};
  globalThis.localStorage={getItem:()=>null};
  Formulario=(await compilar('ManualMaquinaFormulario.jsx')).default;
  DetalheCarregando=(await compilar('ManuaisMaquinas.jsx',{detalhe:true})).ManualDetalhe;
  DetalheLido=(await compilar('ManuaisMaquinas.jsx',{detalhe:true,leituraConcluida:true})).ManualDetalhe;
});
after(async()=>{
  for(const [chave,valor] of Object.entries(globais)){
    if(valor===undefined)delete globalThis[chave];else globalThis[chave]=valor;
  }
  if(pasta)await rm(pasta,{recursive:true,force:true});
});

const item={id:'maquina-ficticia',nome:'Máquina Fictícia',tipo:'maquina',modelo:'Modelo Exemplo',setor:'Oficina Exemplo',identificacao:'SÉRIE-DEMO'};
const conteudo={
  identificacaoConfirmada:true,fabricante:'Fabricante Exemplo',modelo:'Modelo Exemplo',variante:'',responsavelId:'rh-exemplo',revisarEm:'2027-01-01',
  finalidade:'Uso fictício.',seguranca:'Segurança de demonstração.',preparacao:'Preparação fictícia.',operacao:'Instrução preservada da primeira sessão.',qualidade:'Qualidade fictícia.',encerramento:'Encerramento fictício.',limpeza:'Limpeza fictícia.',problemas:'Encaminhamento fictício.',
  fontes:[{id:'11111111-1111-4111-8111-111111111111',titulo:'Fonte Exemplo',url:'https://example.com/manual.pdf',tipo:'fabricante',modelo:'Modelo Exemplo',versao:'1',idioma:'Português',conferidoEm:'2026-10-24',pagina:'2',situacao:'verificado'}],
  consumiveis:[{id:'22222222-2222-4222-8222-222222222222',nome:'Consumível Exemplo',codigo:'DEMO',uso:'Demonstração',compatibilidade:'fabricante',armazenamento:'Condição fictícia',fonteId:'11111111-1111-4111-8111-111111111111'}],
  assistencias:[{id:'33333333-3333-4333-8333-333333333333',nome:'Assistência Exemplo',especialidade:'Demonstração',telefone:'',whatsapp:'',email:'demo@example.com',endereco:'',url:'https://example.com',conferidoEm:'2026-10-24'}],
  treinamentos:[{id:'44444444-4444-4444-8444-444444444444',titulo:'Treinamento Exemplo',objetivo:'Demonstração',conteudo:'Prática fictícia',criterio:'Critério de demonstração',url:'https://example.com/treinamento'}],
  foto:{url:'',fonteUrl:'',legenda:'',usoConfirmado:false},
};
const manual={id:'manual-exemplo',referencia:{tipo:'ativo',id:item.id},conteudo,estado:'aprovado',revisao:4,responsavel:'Responsável Exemplo',atualizadoEm:'2026-10-24T12:00:00.000Z',aprovadoEm:'2026-10-24T12:00:00.000Z',historico:[]};
const propsDetalhe=inicial=>({item,inicial,aoVoltar(){},aoAtualizar(){}});

// Preserva o estado entre chamadas do componente e usa os callbacks reais.
// Não emula o DOM, o modal nativo ou efeitos; essas verificações são de interação.
function montarFormulario(props) {
  const estados=[];
  const internos=React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  let cursor=0;
  const dispatcher={useState(inicial){
    const indice=cursor++;
    if(!(indice in estados))estados[indice]=typeof inicial==='function'?inicial():inicial;
    return [estados[indice],valor=>{estados[indice]=typeof valor==='function'?valor(estados[indice]):valor;}];
  }};
  const renderizar=novasProps=>{
    cursor=0;
    const anterior=internos.ReactCurrentDispatcher.current;
    internos.ReactCurrentDispatcher.current=dispatcher;
    try{return Formulario(novasProps);}finally{internos.ReactCurrentDispatcher.current=anterior;}
  };
  return {renderizar,inicial:renderizar(props)};
}
function texto(elemento){
  if(typeof elemento==='string'||typeof elemento==='number')return String(elemento);
  if(Array.isArray(elemento))return elemento.map(texto).join(' ');
  return React.isValidElement(elemento)?texto(elemento.props.children):'';
}
const enviar=elemento=>elemento.props.children.props.onSubmit({preventDefault(){}});

test('formulário conserva o token e o texto originais quando props passam de v1 para v2',async()=>{
  let recebido;
  const props={item,manual,aoFechar(){},aoSalvar:async(c,v)=>{recebido={conteudo:c,versao:v};}};
  const montado=montarFormulario(props);
  const alterado={...manual,atualizadoEm:'2026-10-24T14:00:00.000Z',conteudo:{...conteudo,operacao:'Texto de outra sessão'}};
  await enviar(montado.renderizar({...props,manual:alterado}));
  assert.equal(recebido.versao,manual.atualizadoEm);
  assert.equal(recebido.conteudo.operacao,conteudo.operacao);
});

test('conflito 409 mantém texto, token original e aviso; uma nova tentativa não avança a base',async()=>{
  let recebeu,fechou=false;
  const props={item,manual,aoFechar(){fechou=true;},aoSalvar:async()=>{throw Object.assign(new Error('Conflito'),{status:409});}};
  const montado=montarFormulario(props);
  await enviar(montado.inicial);
  const alterado={...manual,atualizadoEm:'2026-10-24T15:00:00.000Z',conteudo:{...conteudo,operacao:'Outra atualização'}};
  const novaProps={...props,manual:alterado,aoSalvar:async(c,v)=>{recebeu={conteudo:c,versao:v};}};
  const aposConflito=montado.renderizar(novaProps);
  assert.match(texto(aposConflito),/Seu texto continua neste formulário/);
  assert.equal(fechou,false);
  await enviar(aposConflito);
  assert.equal(recebeu.versao,manual.atualizadoEm);
  assert.equal(recebeu.conteudo.operacao,conteudo.operacao);
});

test('formulário novo conserva base nula mesmo se receber manual criado depois de abrir',async()=>{
  let recebido;
  const props={item,manual:null,aoFechar(){},aoSalvar:async(c,v)=>{recebido={conteudo:c,versao:v};}};
  const montado=montarFormulario(props);
  await enviar(montado.renderizar({...props,manual}));
  assert.equal(recebido.versao,null);
  assert.equal(recebido.conteudo.operacao,'');
});

test('SSR oculta orientação e selo aprovados da lista até confirmar a revisão da ficha',()=>{
  const html=renderToStaticMarkup(React.createElement(DetalheCarregando,propsDetalhe(manual)));
  assert.match(html,/Conferindo a revisão atual/);
  assert.ok(!html.includes(conteudo.operacao));
  assert.ok(!html.includes('is-aprovado'));
});

test('SSR preserva todas as seções do documento, mesmo com abas ocultas, e o responsável projetado',()=>{
  const html=renderToStaticMarkup(React.createElement(DetalheLido,propsDetalhe(manual)));
  for(const trecho of [conteudo.operacao,'Consumível Exemplo','Assistência Exemplo','Treinamento Exemplo','Critério de demonstração','Fonte Exemplo','Responsável Exemplo'])assert.ok(html.includes(trecho),trecho);
  assert.match(html,/class="mm-painel" hidden=""/);
  assert.match(html,/Foto não disponível/);
  assert.ok(!html.includes('Responsável não identificado'));
});

test('SSR distingue ausência de manual e rascunho, sem mostrar selo de aprovação',()=>{
  const vazio=renderToStaticMarkup(React.createElement(DetalheLido,propsDetalhe(null)));
  assert.match(vazio,/Manual ainda não preparado/);
  const rascunho=renderToStaticMarkup(React.createElement(DetalheLido,propsDetalhe({...manual,estado:'rascunho'})));
  assert.match(rascunho,/Conteúdo em preparação/);
  assert.ok(!rascunho.includes('is-aprovado'));
});

test('histórico mostra atual primeiro e snapshots em ordem decrescente sem alterar os registros',()=>{
  const snapshots=[1,3,2].map(revisao=>({conteudo,estado:'rascunho',revisao,atualizadoEm:`2026-10-2${revisao}T12:00:00.000Z`}));
  const html=renderToStaticMarkup(React.createElement(DetalheLido,propsDetalhe({...manual,historico:snapshots})));
  assert.deepEqual([...html.matchAll(/<strong>Revisão (\d+)/g)].map(m=>Number(m[1])),[4,3,2,1]);
  assert.deepEqual(snapshots.map(m=>m.revisao),[1,3,2]);
});
