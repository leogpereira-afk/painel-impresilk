import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSync} from 'esbuild';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {historicoLicitacoesDemo,pesquisaLicitacoesDemo} from '../src/review/licitacoes.mjs';

const arquivo=new URL('../src/services/licitacoes.js',import.meta.url);
const fonte=readFileSync(arquivo,'utf8').replace("import {API} from '../lib/api.js';", "const API='https://api.example';").replace("import {comCracha,mensagemDoStatus} from '../lib/sessao.js';", "const mensagemDoStatus=status=>`Falha ${status}`;");
const codigo=buildSync({stdin:{contents:fonte,resolveDir:dirname(fileURLToPath(arquivo)),loader:'js'},bundle:true,write:false,platform:'node',format:'cjs',define:{'import.meta.env.MODE':'"test"'}}).outputFiles[0].text;
function cliente(fetcher){const modulo={exports:{}};new Function('require','module','exports','comCracha',codigo)(createRequire(import.meta.url),modulo,modulo.exports,fetcher);return modulo.exports;}

test('consulta especifica ID como parâmetro codificado, preserva sinal e não usa cache',async()=>{
  let chamada;const id='versao-exemplo&acao=outro',controller=new AbortController();
  const c=cliente(async(url,opcoes)=>{chamada={url,opcoes};return Response.json({estado:'disponivel',id});});
  const dados=await c.obterPesquisaLicitacoes(controller.signal,id),url=new URL(chamada.url);
  assert.equal(dados.id,id);assert.equal(url.searchParams.get('relatorio'),id);assert.equal(url.searchParams.has('acao'),false);
  assert.equal(chamada.opcoes.signal,controller.signal);assert.equal(chamada.opcoes.cache,'no-store');
});

test('ID inexistente mantém erro e não consulta última pesquisa como fallback',async()=>{
  let chamadas=0;const c=cliente(async()=>{chamadas++;return Response.json({erro:'Relatório não encontrado'},{status:404});});
  await assert.rejects(c.obterPesquisaLicitacoes(undefined,'inexistente-exemplo'),/não encontrado/);assert.equal(chamadas,1);
});

test('resposta de outra versão é recusada pelo cliente',async()=>{
  const c=cliente(async()=>Response.json({estado:'disponivel',id:'outra-versao'}));
  await assert.rejects(c.obterPesquisaLicitacoes(undefined,'versao-escolhida'),/outra pesquisa/);
});

test('última pesquisa omite ID e histórico pede somente a página selecionada',async()=>{
  const chamadas=[];const c=cliente(async(url)=>{chamadas.push(new URL(url));return Response.json(url.includes('historico')?{estado:'historico',registros:[],pagina:2,temMais:false}:{estado:'sem_relatorio'});});
  await c.obterPesquisaLicitacoes();await c.obterHistoricoLicitacoes(undefined,2);
  assert.equal(chamadas[0].searchParams.has('relatorio'),false);assert.equal(chamadas[1].searchParams.get('acao'),'historico');assert.equal(chamadas[1].searchParams.get('pagina'),'2');
});

test('histórico incompleto ou de outra página não é aceito como atual',async()=>{
  for(const body of [{estado:'historico',registros:[],pagina:1,temMais:false},{estado:'historico',registros:[],pagina:2},{estado:'disponivel'}]){
    const c=cliente(async()=>Response.json(body));await assert.rejects(c.obterHistoricoLicitacoes(undefined,2),/histórico não foi confirmado/);
  }
});

test('prévia possui duas páginas e versões distintas, com candidatos pendentes fictícios',async()=>{
  const a=await historicoLicitacoesDemo(undefined,1),b=await historicoLicitacoesDemo(undefined,2);
  assert.equal(a.registros.length,20);assert.equal(a.temMais,true);assert.equal(b.registros.length,3);assert.equal(b.temMais,false);
  const atual=await pesquisaLicitacoesDemo(),anterior=await pesquisaLicitacoesDemo(undefined,a.registros[1].id);
  assert.equal(atual.id,a.registros[0].id);assert.notEqual(atual.id,anterior.id);assert.notEqual(atual.hash,anterior.hash);
  assert.ok(atual.candidatosRetidos.length>=2);assert.ok(atual.candidatosRetidos[0].processo.includes('fictício'));
  assert.notEqual(atual.oportunidades[0].produto,anterior.oportunidades[0].produto);
  await assert.rejects(pesquisaLicitacoesDemo(undefined,'inexistente-exemplo'),/não encontrado/);
});
