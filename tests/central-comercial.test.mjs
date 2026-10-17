import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('vite'))('esbuild');
const SRC=fileURLToPath(new URL('../src/',import.meta.url));
const paginas=['Comercial','Bancos','Glossario','ContasAtrasadas','FerramentaBrief','DashboardComercial'];
let tela;
async function renderizar(permissoes,caminho){
  if(!tela){
    const saida=await build({
      stdin:{contents:`
        import React from 'react';
        import {renderToReadableStream} from 'react-dom/server.browser';
        import {MemoryRouter} from 'react-router-dom';
        import Central from './pages/CentralComercial.jsx';
        export async function renderizar(permissoes,caminho){
          const stream=await renderToReadableStream(React.createElement(MemoryRouter,{initialEntries:[caminho]},React.createElement(Central,{sessao:{usuario:'teste',master:false,permissoes}})));
          await stream.allReady;
          return new Response(stream).text();
        }
      `,resolveDir:SRC,loader:'jsx',sourcefile:'central-comercial-test.jsx'},
      bundle:true,format:'esm',platform:'neutral',write:false,logLevel:'silent',jsx:'automatic',
      mainFields:['module','main'],conditions:['browser','import','default'],loader:{'.css':'empty'},
      define:{'import.meta.env':'{"MODE":"test"}','process.env.NODE_ENV':'"production"'},
      plugins:[{name:'conteudos-ficticios-sem-api',setup(b){
        b.onLoad({filter:/\/pages\/[^/]+\.jsx$/},args=>{
          const nome=args.path.split('/').at(-1).replace('.jsx','');
          if(!paginas.includes(nome))return;
          return {contents:`export default function Tela(){return <div data-tela="${nome}">Conteúdo completo de ${nome}</div>}`,loader:'jsx'};
        });
      }}],
    });
    tela=await import('data:text/javascript;base64,'+Buffer.from(saida.outputFiles[0].text).toString('base64'));
  }
  return tela.renderizar(permissoes,caminho);
}
const links=html=>[...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map(m=>m[1]);

test('conta somente Bancos abre tela completa sem obter acesso a vendas ou Dashboard',async()=>{
  const html=await renderizar(['bancos'],'/comercial/bancos');
  assert.deepEqual(links(html),['/comercial/bancos','/comercial/brief']);
  assert.match(html,/data-tela="Bancos"/);
  assert.doesNotMatch(html,/data-tela="Comercial"|data-tela="DashboardComercial"/);
  assert.match(html,/aria-current="page"/);
});

test('acesso direto a Dashboard ou cobranças sem permissão não monta a página',async()=>{
  for(const path of ['/comercial/dashboard','/comercial/contas-atrasadas']){
    const html=await renderizar(['bancos'],path);
    assert.match(html,/Acesso não liberado/);
    assert.doesNotMatch(html,/data-tela=/);
  }
});

test('navegação completa conserva ordem e só monta a ferramenta selecionada',async()=>{
  const html=await renderizar(['*'],'/comercial/dashboard?aba=produtos&ano=2026');
  assert.deepEqual(links(html),['/comercial','/comercial/bancos','/comercial/glossario','/comercial/contas-atrasadas','/comercial/brief','/comercial/dashboard?aba=produtos&amp;ano=2026']);
  assert.deepEqual([...html.matchAll(/data-tela="([^"]+)"/g)].map(m=>m[1]),['DashboardComercial']);
});

test('Brief permanece acessível pela autenticação própria sem montar outra ferramenta',async()=>{
  const html=await renderizar([],'/comercial/brief');
  assert.deepEqual(links(html),['/comercial/brief']);
  assert.match(html,/data-tela="FerramentaBrief"/);
});

test('rota desconhecida não abre outra ferramenta silenciosamente',async()=>{
  const html=await renderizar(['*'],'/comercial/inexistente');
  assert.match(html,/Área não encontrada/);
  assert.doesNotMatch(html,/data-tela=/);
});
