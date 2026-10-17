import {test} from 'node:test';
import {nomeCompletoSis} from '../src/lib/sistemas.js';
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
   loader:{'.css':'empty','.png':'empty','.webp':'empty','.ttf':'empty'},
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
const atalhosInternos=html=>atalhos(html).filter(l=>l.href.startsWith('/'));
const calendario=links=>links.filter(l=>l.texto==='Calendário');

test('direção abre o calendário existente no mês selecionado e a agenda de compromissos',async()=>{
 const html=await renderizar({...sessao([]),master:true}),links=atalhosInternos(html);
 assert.deepEqual(calendario(links),[{href:'/calendario-empresa?mes=2026-09',texto:'Calendário'}]);
 assert.ok(links.some(l=>l.href==='/compromissos'&&l.texto==='Compromissos'));
 assert.ok(links.some(l=>l.href==='/contas-atrasadas'&&l.texto==='Pagamentos atrasados'));
 assert.match(html,/Dicas de produtos/);
 assert.match(html,/Novo orçamento/);
});

test('vendedora com apenas Comercial não recebe atalhos para módulos sem acesso',async()=>{
 const html=await renderizar(sessao(['orcamentos']));
 assert.deepEqual(atalhosInternos(html),[{href:'/brief',texto:nomeCompletoSis('brief')}]);
 assert.match(html,/Dicas de produtos/,'orientações de produtos continuam acessíveis dentro do Comercial');
});

test('calendário encaminha para Produção quando esse é o módulo autorizado',async()=>{
 const links=atalhosInternos(await renderizar(sessao(['orcamentos','agenda'])));
 assert.deepEqual(links,[{href:'/agenda?mes=2026-09',texto:'Calendário'},{href:'/brief',texto:nomeCompletoSis('brief')}]);
});

test('calendário usa Reuniões como alternativa quando é a única agenda autorizada',async()=>{
 const links=atalhosInternos(await renderizar(sessao(['orcamentos','reunioes'])));
 assert.deepEqual(links,[{href:'/reunioes?mes=2026-09',texto:'Calendário'},{href:'/brief',texto:nomeCompletoSis('brief')}]);
});

test('Compromissos é independente de Calendário e não recebe o ID do vendedor como dono',async()=>{
 const links=atalhosInternos(await renderizar(sessao(['orcamentos','compromissos']),'/comercial?de=2026-10-01&ate=2026-10-31&vendedor=102'));
 assert.deepEqual(links,[{href:'/compromissos',texto:'Compromissos'},{href:'/brief',texto:nomeCompletoSis('brief')}]);
});

test('Pagamentos atrasados reutiliza a cobrança existente somente com permissão',async()=>{
 const links=atalhosInternos(await renderizar(sessao(['orcamentos','contas-atrasadas']),'/comercial?vendedor=102'));
 assert.deepEqual(links,[{href:'/contas-atrasadas',texto:'Pagamentos atrasados'},{href:'/brief',texto:nomeCompletoSis('brief')}]);
});

test('acesso total escolhe um único calendário e respeita o mês dos filtros também na rota antiga',async()=>{
 const links=atalhosInternos(await renderizar(sessao(['*']),'/orcamentos?de=2026-08-15&ate=2026-09-20'));
 assert.deepEqual(calendario(links),[{href:'/calendario-empresa?mes=2026-08',texto:'Calendário'}]);
 assert.equal(links.filter(l=>l.texto==='Compromissos').length,1);
});

test('Central recebe a sessão vigente e as rotas antigas preservam a guarda',()=>{
 const app=readFileSync(new URL('../src/App.jsx',import.meta.url),'utf8');
 const central=readFileSync(new URL('../src/pages/CentralComercial.jsx',import.meta.url),'utf8');
 assert.match(app,/path="\/comercial\/\*" element=\{<CentralComercial sessao=\{sessao\}/);
 assert.match(app,/path="\/orcamentos" element=\{<Restrito modulo="orcamentos" sessao=\{sessao\}><ComercialAntigo/);
 assert.match(central,/secoesComerciais\(m=>podeAbrir\(m,sessao\)\)/);
 assert.match(central,/<Comercial sessao=\{sessao\} integrada/);
 assert.match(central,/!permitida\?/,'acesso direto sem permissão deve mostrar recusa antes de montar tela');
});

// O atalho abre a mesma rota interna da lateral; a autenticação
// e as permissões do Brief continuam sendo verificadas pelo próprio sistema.
test('Brief no topo reutiliza nome do cadastro e rota interna, em todas as abas',async()=>{
 for(const aba of ['painel','orcamentos','relacionamento','vendas','clientes','produtos','metas']){
  const html=await renderizar(sessao(['orcamentos']),`/comercial?aba=${aba}`);
  const links=atalhos(html).filter(l=>l.texto===nomeCompletoSis('brief'));
  assert.deepEqual(links,[{href:'/brief',texto:nomeCompletoSis('brief')}],aba);
  const link=html.match(/<a\b[^>]*class="com-shortcut com-shortcut-brief"[^>]*>/)?.[0];
  assert.ok(link,'atalho interno existente');
  assert.doesNotMatch(link,/target="_blank"/);

  assert.match(link,/aria-label="Brief de Medição"/);
 }
});
