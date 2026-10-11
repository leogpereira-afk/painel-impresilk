/* A REGUA DA COPIA DO PCP (supabase/functions/_shared/backup-pcp.mjs), sem
 * rede: o protocolo da porta exportarBackup e a conferencia da contagem.
 * Os casos ruins primeiro: linha repetida, cursor que volta, contagem que
 * falta, exportado fora da faixa. Dados ficticios.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {exportarPCP, conferirExportacao, COLECOES_PCP_OBRIGATORIAS, statusPCP} from '../supabase/functions/_shared/backup-pcp.mjs';

const contagem=(extra={})=>({pcp_registros:Object.fromEntries(COLECOES_PCP_OBRIGATORIAS.map(c=>[c,{total:0,apagados:0}]).concat(Object.entries(extra))),pcp_demandas:0});
const linha=(colecao,id,apagado=false)=>({colecao,id,apagado,registro:{id}});
const paginas=lista=>{let i=0;return async()=>lista[i++];};

test('exportação: linha repetida entre páginas, cursor que volta e contagem faltando são recusados',async()=>{
  const c=contagem({os:{total:2,apagados:0}});
  await assert.rejects(exportarPCP(paginas([
    {registros:[linha('os','a')],demandas:[],contagemInicio:c,cfg:{},nextCursor:'1'},
    {registros:[linha('os','a')],demandas:[],nextCursor:null,contagemFim:c}])),/linha repetida/);
  await assert.rejects(exportarPCP(paginas([
    {registros:[linha('os','a')],demandas:[],contagemInicio:c,cfg:{},nextCursor:'1'},
    {registros:[linha('os','b')],demandas:[],nextCursor:'1'}])),/cursor repetido/);
  await assert.rejects(exportarPCP(paginas([{registros:[],demandas:[],cfg:{},nextCursor:null,contagemFim:c}])),/contagem inicial/);
  await assert.rejects(exportarPCP(paginas([{registros:[],demandas:[],contagemInicio:c,cfg:{},nextCursor:null}])),/contagem final/);
  await assert.rejects(exportarPCP(paginas([{error:'Entre no sistema.'}])),/sem registros/);
  let n=0;
  await assert.rejects(exportarPCP(async()=>({registros:[linha('os','x'+n)],demandas:[],contagemInicio:c,cfg:{},nextCursor:'c'+(n++)}),{maxPaginas:5}),/limite de páginas/);
});

test('conferência: o exportado fica entre o antes e o depois; fora disso, ou sem config, é divergência',()=>{
  const base={cfg:{a:1},pcp_registros:[linha('os','a'),linha('os','b',true)],pcp_demandas:[{id:'d1'}]};
  const ini={...contagem({os:{total:2,apagados:1}}),pcp_demandas:1};
  // Uma O.S. nova gravada no meio: o fim conta 3, o exportado 2 (dentro da faixa).
  const fim={...contagem({os:{total:3,apagados:1}}),pcp_demandas:1};
  let c=conferirExportacao({...base,contagemInicio:ini,contagemFim:fim});
  assert.deepEqual(c.divergencias,[]);
  assert.equal(c.porColecao.os,2);assert.equal(c.lapides,1);assert.equal(c.porColecao.pcp_demandas,1);assert.equal(c.porColecao.config,1);
  assert.equal(c.registros,3);
  // Exportou menos do que já existia no começo: falta linha.
  c=conferirExportacao({...base,pcp_registros:[linha('os','a')],contagemInicio:ini,contagemFim:fim});
  assert.ok(c.divergencias.includes('os: 1 exportadas, esperadas entre 2 e 3'),JSON.stringify(c.divergencias));
  assert.ok(c.divergencias.includes('os: 0 excluídas (lápides) exportadas, esperadas 1'));
  // Exportou mais do que o fim conhece (linha repetida que escapou, ou contagem errada).
  c=conferirExportacao({...base,pcp_registros:[...base.pcp_registros,linha('os','c'),linha('os','d')],contagemInicio:ini,contagemFim:fim});
  assert.ok(c.divergencias.includes('os: 4 exportadas, esperadas entre 2 e 3'));
  // Coleção exportada que a contagem do fim não conhece.
  c=conferirExportacao({...base,pcp_registros:[...base.pcp_registros,linha('nova','n1')],contagemInicio:ini,contagemFim:fim});
  assert.ok(c.divergencias.includes('nova: exportada sem contagem do PCP'));
  // Sem config, demandas fora da faixa.
  c=conferirExportacao({...base,cfg:null,pcp_demandas:[],contagemInicio:ini,contagemFim:fim});
  assert.ok(c.divergencias.includes('config: configuração ausente'));
  assert.ok(c.divergencias.includes('pcp_demandas: 0 exportadas, esperadas 1'));
  // Lápide que voltou a ser O.S. no meio da exportação não vira falso alarme.
  c=conferirExportacao({...base,pcp_registros:[linha('os','a'),linha('os','b')],contagemInicio:ini,contagemFim:{...fim,pcp_registros:{...fim.pcp_registros,os:{total:2,apagados:0}}}});
  assert.deepEqual(c.divergencias,[]);
});

test('situação: ok só com contagem que bate, arquivo do dia gravado e todos os arquivos com cópia',()=>{
  const copia={completo:true,falhas:[],comCopia:3,existem:3,copiados:1,porBucket:{}};
  const reg={divergencias:[],porColecao:{os:2},lapides:1,registros:3};
  assert.equal(statusPCP({nome:'PCP',em:'x',copia,registros:reg,gravado:true}).ok,true);
  assert.equal(statusPCP({nome:'PCP',em:'x',copia,registros:reg,gravado:false,erroGravacao:'GitHub 500'}).erro,'GitHub 500');
  const metade=statusPCP({nome:'PCP',em:'x',copia:{...copia,completo:false,comCopia:2},registros:reg,gravado:true});
  assert.equal(metade.ok,false);assert.equal(metade.emAndamento,true);assert.match(metade.erro,/2 de 3/);
  const semReg=statusPCP({nome:'PCP',em:'x',copia,registros:null,gravado:false});
  assert.equal(semReg.ok,false);assert.match(semReg.erro,/registros do PCP/);
  const div=statusPCP({nome:'PCP',em:'x',copia,registros:{...reg,divergencias:['a','b','c','d']},gravado:true});
  assert.equal(div.ok,false);assert.equal(div.erro,'A contagem não confere: a; b; c (e mais 1).');
});
