import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildSync} from 'esbuild';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const arquivo=new URL('../src/services/licitacoes.js',import.meta.url);
const codigo=buildSync({stdin:{contents:readFileSync(arquivo,'utf8'),resolveDir:dirname(fileURLToPath(arquivo)),loader:'js'},bundle:true,write:false,platform:'node',format:'cjs',define:{'import.meta.env.MODE':'"test"'}}).outputFiles[0].text;
const modulo={exports:{}};new Function('require','module','exports',codigo)(createRequire(import.meta.url),modulo,modulo.exports);
const {criarControleExecucaoLicitacoes}=modulo.exports;
function promessa(){let resolve;const p=new Promise(r=>{resolve=r;});return {p,resolve};}
test('cancelamento da sessão aborta e descarta retorno atrasado do disparo',async()=>{
 const pendente=promessa(),estados=[];let sinal;
 const c=criarControleExecucaoLicitacoes({consultar:async()=>({estado:'sem_execucao'}),iniciar:s=>{sinal=s;return pendente.p;},receber:e=>estados.push(e)});
 const rodando=c.rodar();c.cancelar();const total=estados.length;pendente.resolve({estado:'solicitada'});await rodando;
 assert.equal(sinal.aborted,true);assert.equal(estados.length,total);
});
test('dois cliques durante envio compartilham operação e não iniciam segundo disparo',async()=>{
 const pendente=promessa(),estados=[];let chamadas=0;
 const c=criarControleExecucaoLicitacoes({consultar:async()=>({estado:'sem_execucao'}),iniciar:()=>{chamadas++;return pendente.p;},receber:e=>estados.push(e)});
 const a=c.rodar(),b=c.rodar();pendente.resolve({estado:'solicitada'});await Promise.all([a,b]);
 assert.equal(chamadas,1);assert.equal(estados.at(-1).dados.estado,'solicitada');assert.equal(estados.at(-1).iniciando,false);
});
test('erro de consulta mantém execução anterior identificada com aviso de leitura falha',async()=>{
 const estados=[];let n=0;
 const c=criarControleExecucaoLicitacoes({consultar:async()=>{if(n++)throw Error('Falha fictícia');return {estado:'em_andamento'};},iniciar:async()=>({estado:'solicitada'}),receber:e=>estados.push(e)});
 await c.atualizar();await c.atualizar();assert.equal(estados.at(-1).dados.estado,'em_andamento');assert.equal(estados.at(-1).erro,'Falha fictícia');
});
test('consulta mais recente substitui leitura antiga sem polling automático',async()=>{
 const a=promessa(),b=promessa(),estados=[];let n=0;
 const c=criarControleExecucaoLicitacoes({consultar:()=>n++===0?a.p:b.p,iniciar:async()=>({estado:'solicitada'}),receber:e=>estados.push(e)});
 const primeira=c.atualizar(),segunda=c.atualizar();b.resolve({estado:'concluida'});await segunda;a.resolve({estado:'em_andamento'});await primeira;
 assert.equal(estados.at(-1).dados.estado,'concluida');assert.equal(n,2);
});
