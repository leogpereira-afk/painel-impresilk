import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('vite'))('esbuild');
let tela;
async function renderizar(permissoes,caminho='/comercial/glossario'){
  if(!tela){
    const saida=await build({
      stdin:{contents:`
        import React from 'react';
        import {renderToReadableStream} from 'react-dom/server.browser';
        import {MemoryRouter} from 'react-router-dom';
        import Glossario from './pages/GlossarioComercial.jsx';
        export async function renderizar(permissoes,caminho){
          const stream=await renderToReadableStream(React.createElement(MemoryRouter,{initialEntries:[caminho]},React.createElement(Glossario,{sessao:{usuario:'teste',master:false,permissoes}})));
          await stream.allReady;
          return new Response(stream).text();
        }
      `,resolveDir:fileURLToPath(new URL('../src/',import.meta.url)),loader:'jsx'},
      bundle:true,format:'esm',platform:'neutral',write:false,logLevel:'silent',jsx:'automatic',
      mainFields:['module','main'],conditions:['browser','import','default'],loader:{'.css':'empty'},
      define:{'import.meta.env':'{"MODE":"test"}','process.env.NODE_ENV':'"production"'},
      plugins:[{name:'fontes-ficticias',setup(b){
        b.onResolve({filter:/\/(Glossario|SolucoesComerciais)\.jsx$/},args=>({path:args.path,namespace:'fonte-ficticia'}));
        b.onLoad({filter:/.*/,namespace:'fonte-ficticia'},args=>({contents:`export default function Conteudo(){return <div data-conteudo="${args.path.includes('SolucoesComerciais')?'solucoes':'termos'}"/>}`,loader:'jsx',resolveDir:fileURLToPath(new URL('../src/',import.meta.url))}));
      }}],
    });
    tela=await import('data:text/javascript;base64,'+Buffer.from(saida.outputFiles[0].text).toString('base64'));
  }
  return tela.renderizar(permissoes,caminho);
}

test('usuário do Comercial mantém soluções sem ganhar leitura ou edição dos termos',async()=>{
  const html=await renderizar(['orcamentos']);
  assert.match(html,/data-conteudo="solucoes"/);
  assert.doesNotMatch(html,/data-conteudo="termos"/);
  assert.doesNotMatch(html,/Termos e conceitos<\/a>/);
  assert.match(html,/Soluções comerciais<\/a>/);
});

test('usuário só do Glossário mantém termos sem carregar catálogo comercial',async()=>{
  const html=await renderizar(['glossario']);
  assert.match(html,/data-conteudo="termos"/);
  assert.doesNotMatch(html,/data-conteudo="solucoes"/);
  assert.doesNotMatch(html,/Soluções comerciais<\/a>/);
});

test('acesso direto a subaba não autorizada não monta fonte alternativa silenciosamente',async()=>{
  for(const [permissoes,secao] of [[['glossario'],'solucoes'],[['orcamentos'],'termos'],[[],'termos']]){
    const html=await renderizar(permissoes,`/comercial/glossario?secao=${secao}`);
    assert.match(html,/Conteúdo não liberado/);
    assert.doesNotMatch(html,/data-conteudo=/);
  }
});

test('troca entre termos e soluções preserva referências da query',async()=>{
  const html=await renderizar(['*'],'/comercial/glossario?secao=solucoes&produto=item-ficticio&de=2026-01-01');
  assert.match(html,/secao=termos&amp;produto=item-ficticio&amp;de=2026-01-01/);
  assert.match(html,/data-conteudo="solucoes"/);
});
