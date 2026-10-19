import test from 'node:test';
import assert from 'node:assert/strict';
import {janelaPublica,coletarPropostasPNCP,integrarColetaPublica} from '../scripts/licitacoes/coleta-publica.mjs';
test('janela é de 90 dias inclusivos no calendário de Brasília',()=>assert.deepEqual(janelaPublica(new Date('2026-10-19T02:00:00Z')),{inicio:'2026-07-21',fim:'2026-10-18'}));
test('PNCP segue todas páginas, deduplica e registra alteração de contagem',async()=>{
  const calls=[];
  const out=await coletarPropostasPNCP({agora:()=>new Date('2026-10-19T12:00:00Z'),pausar:async()=>{},fetcher:async u=>{const url=new URL(u);calls.push(url);const p=Number(url.searchParams.get('pagina'));return Response.json({numeroPagina:p,totalPaginas:2,totalRegistros:p===1?3:4,data:p===1?[{numeroControlePNCP:'A'},{numeroControlePNCP:'B'}]:[{numeroControlePNCP:'B'},{numeroControlePNCP:'C'}]});}});
  assert.equal(calls.length,2);assert.equal(out.registros.length,3);assert.equal(out.paginas.length,2);assert.equal(out.paginacaoCompleta,true);assert.equal(out.baseMutavel,true);assert.ok(calls.every(u=>u.hostname==='pncp.gov.br'&&u.searchParams.get('uf')==='MG'));
});
test('falha não é convertida em zero processos nem pesquisa concluída',async()=>{
  const out=await coletarPropostasPNCP({fetcher:async()=>new Response('',{status:503}),pausar:async()=>{},tentativas:1});assert.equal(out.paginacaoCompleta,false);assert.equal(out.erros.length,1);
});
test('integra sem apagar recibos e preserva incompletude das outras etapas',()=>{
  const base={periodo:{inicio:'2026-07-22',fim:'2026-10-19'},geradoEm:'2026-10-19T12:00:00Z',fontes:[],recibos:[],candidatos:[],instituicoes:[]};
  const d=integrarColetaPublica(base,{registros:[],paginas:[1,2],totalPaginas:2,paginacaoCompleta:true,erros:[],baseMutavel:false,consultadoEm:'2026-10-19T12:10:00Z',horizonte:'2027-10-19'},new Date('2026-10-19T12:11:00Z'));
  assert.equal(d.recibos.length,1);assert.equal(d.recibos[0].municipios.length,89);assert.equal(d.recibos[0].resultado,'PARCIAL');assert.equal(d.recibos[0].itensExaminadosIntegralmente,false);assert.equal(d.recibos[0].periodo.inicio,'2026-07-22');
});
test('rodada de outro dia não transforma consultas antigas em atuais',()=>{
  const base={periodo:{inicio:'2026-07-21',fim:'2026-10-18'},recibos:[{id:'antigo',periodo:{inicio:'2026-07-21',fim:'2026-10-18'}}],fontes:[],candidatos:[]};
  const d=integrarColetaPublica(base,{registros:[],paginas:[],totalPaginas:1,paginacaoCompleta:false,erros:['HTTP503'],consultadoEm:'2026-10-19T12:10:00Z',horizonte:'2027-10-19'},new Date('2026-10-19T12:11:00Z'));
  assert.equal(d.recibos.find(r=>r.id==='antigo').periodo.fim,'2026-10-18');assert.equal(d.periodo.fim,'2026-10-19');
});
