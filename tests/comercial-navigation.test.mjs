import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const {build}=createRequire(require.resolve('vite'))('esbuild');
const SRC=fileURLToPath(new URL('../src/',import.meta.url));
const entrada=`
 import React from 'react';
 import {renderToStaticMarkup} from 'react-dom/server.browser';
 import {MemoryRouter} from 'react-router-dom';
 import Comercial from './pages/Comercial.jsx';
 export const renderizar=(sessao,caminho)=>renderToStaticMarkup(
   React.createElement(MemoryRouter,{initialEntries:[caminho]},
     React.createElement(Comercial,{sessao})));
`;

// A renderização usa as permissões e os links reais da página. Nenhum efeito
// de leitura do servidor roda no SSR e nenhuma sessão de produção é usada.
let tela;
async function renderizar(sessao,caminho='/comercial?de=2026-09-01&ate=2026-09-30'){
 if(!tela){
  const saida=await build({
   stdin:{contents:entrada,resolveDir:SRC,loader:'jsx',sourcefile:'comercial-navigation-entry.jsx'},
   bundle:true,format:'esm',platform:'neutral',write:false,logLevel:'silent',jsx:'automatic',
   mainFields:['module','main'],conditions:['browser','import','default'],
   loader:{'.css':'empty','.png':'empty','.ttf':'empty'},
   define:{'import.meta.env':'{"MODE":"test"}','process.env.NODE_ENV':'"production"'},
  });
  tela=await import('data:text/javascript;base64,'+Buffer.from(saida.outputFiles[0].text).toString('base64'));
 }
 return tela.renderizar(sessao,caminho);
}
const sessao=permissoes=>({usuario:'vendedora-teste',nome:'Ana Exemplo',master:false,permissoes});
const atalhos=html=>{
 const nav=html.match(/<nav[^>]*aria-label="Atalhos da rotina comercial"[^>]*>([\s\S]*?)<\/nav>/)?.[1];
 assert.ok(nav,'a navegação de rotina precisa de nome acessível');
 return [...nav.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
  .map(([,href,conteudo])=>({href:href.replace(/&amp;/g,'&'),texto:conteudo.replace(/<[^>]+>/g,'').trim()}));
};
const calendario=links=>links.filter(l=>l.texto==='Calendário');

test('direção abre o calendário existente no mês selecionado e a agenda de compromissos',async()=>{
 const html=await renderizar({...sessao([]),master:true}),links=atalhos(html);
 assert.deepEqual(calendario(links),[{href:'/calendario-empresa?mes=2026-09',texto:'Calendário'}]);
 assert.ok(links.some(l=>l.href==='/compromissos'&&l.texto==='Compromissos'));
 assert.ok(links.some(l=>l.href==='/contas-atrasadas'&&l.texto==='Pagamentos atrasados'));
 assert.match(html,/Dicas de produtos/);
 assert.match(html,/Novo orçamento/);
});

test('vendedora com apenas Comercial não recebe atalhos para módulos sem acesso',async()=>{
 const html=await renderizar(sessao(['orcamentos']));
 assert.deepEqual(atalhos(html),[]);
 assert.match(html,/Dicas de produtos/,'orientações de produtos continuam acessíveis dentro do Comercial');
});

test('calendário encaminha para Produção quando esse é o módulo autorizado',async()=>{
 const links=atalhos(await renderizar(sessao(['orcamentos','agenda'])));
 assert.deepEqual(links,[{href:'/agenda?mes=2026-09',texto:'Calendário'}]);
});

test('calendário usa Reuniões como alternativa quando é a única agenda autorizada',async()=>{
 const links=atalhos(await renderizar(sessao(['orcamentos','reunioes'])));
 assert.deepEqual(links,[{href:'/reunioes?mes=2026-09',texto:'Calendário'}]);
});

test('Compromissos é independente de Calendário e não recebe o ID do vendedor como dono',async()=>{
 const links=atalhos(await renderizar(sessao(['orcamentos','compromissos']),'/comercial?de=2026-10-01&ate=2026-10-31&vendedor=102'));
 assert.deepEqual(links,[{href:'/compromissos',texto:'Compromissos'}]);
});

test('Pagamentos atrasados reutiliza a cobrança existente somente com permissão',async()=>{
 const links=atalhos(await renderizar(sessao(['orcamentos','contas-atrasadas']),'/comercial?vendedor=102'));
 assert.deepEqual(links,[{href:'/contas-atrasadas',texto:'Pagamentos atrasados'}]);
});

test('acesso total escolhe um único calendário e respeita o mês dos filtros também na rota antiga',async()=>{
 const links=atalhos(await renderizar(sessao(['*']),'/orcamentos?de=2026-08-15&ate=2026-09-20'));
 assert.deepEqual(calendario(links),[{href:'/calendario-empresa?mes=2026-08',texto:'Calendário'}]);
 assert.equal(links.filter(l=>l.texto==='Compromissos').length,1);
});

test('as duas entradas do Comercial fornecem a sessão usada nos atalhos e preservam a guarda',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 for(const rota of ['/comercial','/orcamentos']){
  const linha=app.split('\n').find(l=>l.includes(`path="${rota}"`));
  assert.ok(linha,`rota ${rota} existente`);
  assert.match(linha,/<Comercial\s+sessao=\{sessao\}/,`${rota} deve fornecer a sessão vigente`);
  assert.match(linha,/<Restrito\s+modulo="orcamentos"\s+sessao=\{sessao\}/,`${rota} deve preservar a permissão da área`);
 }
});
