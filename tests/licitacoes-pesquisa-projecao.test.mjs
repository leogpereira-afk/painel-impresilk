import test from 'node:test';
import assert from 'node:assert/strict';
import {consultarPesquisaLicitacoes,projetarPesquisaLicitacoes,hashPesquisa,URL_PESQUISA_LICITACOES,MAX_BYTES_PESQUISA} from '../supabase/functions/_shared/licitacoes-pesquisa.mjs';
import {gerarRelatorio} from '../supabase/functions/_shared/licitacoes-controle.mjs';
const agora=new Date('2026-10-12T15:00:00Z');
async function entrada(overrides={}) {
  const dossie={periodo:{inicio:'2026-10-12',fim:'2026-10-18'},geradoEm:'2026-10-12T12:00:00Z',fontes:[],recibos:[],candidatos:[]};
  const report=gerarRelatorio(dossie);
  return {estado:'disponivel',registro:{id:'pesquisa-ficticia',periodo_de:'2026-10-12',periodo_ate:'2026-10-18',gerado_em:dossie.geradoEm,recebido_em:'2026-10-12T12:00:01Z',versao:report.versao,dossie,hash_sha256:await hashPesquisa(dossie),...overrides}};
}
test('estado inicial tem 89 não consultados e mantém diferença de relatório ausente',async()=>{
  const r=await projetarPesquisaLicitacoes(await entrada(),agora);
  assert.equal(r.cobertura.totalMunicipios,89);assert.equal(r.cobertura.naoConsultados,89);
  assert.equal(r.cobertura.coberturaPercentual,0);assert.equal(r.pesquisaIniciada,false);
  assert.equal(r.municipios.length,89);assert.equal(r.oportunidades.length,0);
  assert.equal(r.coberturaInstituicoes.totalRegistros,32);
  assert.equal(r.instituicoes.length,32);
  for(const instituicao of ['Unimontes','UFMG / ICA','IFMG','IFNMG'])assert.ok(r.instituicoes.some(item=>item.instituicao===instituicao),`${instituicao} tem cobertura separada`);
  assert.deepEqual(await projetarPesquisaLicitacoes({estado:'sem_relatorio'},agora),{estado:'sem_relatorio'});
  assert.ok(!('dossie' in r)&&!('registro' in r)&&!('recibos' in r));
});
test('consulta posterior não renova geração nem infere cobertura de pesquisa antiga',async()=>{
  const r=await projetarPesquisaLicitacoes(await entrada(),new Date('2026-10-20T12:00:00Z'));
  assert.equal(r.antigo,true);assert.equal(r.geradoEm,'2026-10-12T12:00:00Z');assert.equal(r.consultadoEm,'2026-10-20T12:00:00.000Z');
  assert.equal(r.cobertura.concluidos,0);
});
test('metadados, versão e checksum precisam corresponder ao dossiê, sem confiar em resumo',async()=>{
  for(const override of [{hash_sha256:'0'.repeat(64)},{periodo_de:'2026-10-11'},{periodo_ate:'2026-10-20'},{gerado_em:'2026-10-12T14:00:00Z'},{versao:'outra'},{id:'../arquivo'},{relatorio:{resumo:{coberturaPercentual:100}}}])await assert.rejects(projetarPesquisaLicitacoes(await entrada(override),agora),/indisponível/);
});
test('campos privados e objetos extras nunca atravessam a projeção pública',async()=>{
  for(const extra of [{rh:{salario:1000}},{memoria:'PRIVADO'},{token:'PRIVADO'},{candidatos:[{id:'exemplo',anexo:'PRIVADO'}]}]){
    const e=await entrada();Object.assign(e.registro.dossie,extra);e.registro.hash_sha256=await hashPesquisa(e.registro.dossie);
    await assert.rejects(projetarPesquisaLicitacoes(e,agora),/indisponível/);
  }
  await assert.rejects(projetarPesquisaLicitacoes({estado:'sem_relatorio',memoria:'PRIVADO'},agora),/indisponível/);
});
test('credencial dedicada só segue para URL fixa em GET sem redirect ou token de pessoa',async()=>{
  let chamada;
  const r=await consultarPesquisaLicitacoes({token:'segredo-sintetico',agora:()=>agora,fetcher:async(url,opcoes)=>{chamada={url,opcoes};return Response.json(await entrada());}});
  assert.equal(r.estado,'disponivel');assert.equal(chamada.url,URL_PESQUISA_LICITACOES);
  assert.equal(chamada.opcoes.method,'GET');assert.equal(chamada.opcoes.redirect,'error');
  assert.deepEqual(chamada.opcoes.headers,{'x-licitacoes-painel-token':'segredo-sintetico',accept:'application/json'});
  assert.equal(chamada.opcoes.signal.aborted,true);
  assert.doesNotMatch(JSON.stringify(r),/segredo-sintetico/);
});
test('sem segredo, erro HTTP, JSON inválido e corpo grande recusam leitura sem zeros',async()=>{
  let chamadas=0;
  await assert.rejects(consultarPesquisaLicitacoes({token:'',fetcher:async()=>{chamadas++;}}),/não está configurada/);
  assert.equal(chamadas,0);
  for(const response of [new Response('privado',{status:401}),new Response('{'),new Response(' '.repeat(MAX_BYTES_PESQUISA+1)),new Response('{}',{headers:{'content-length':String(MAX_BYTES_PESQUISA+1)}})]){
    await assert.rejects(consultarPesquisaLicitacoes({token:'sintetico',fetcher:async()=>response}),/indisponível/);
  }
});
test('timeout cobre também corpo que não termina e cancela sinal',async()=>{
  let signal;
  await assert.rejects(consultarPesquisaLicitacoes({token:'sintetico',timeoutMs:10,fetcher:async(_url,opcoes)=>{signal=opcoes.signal;return new Response(new ReadableStream({start(){}}));}}),/indisponível/);
  assert.equal(signal.aborted,true);
});
test('link do bot usa somente username validado e domínio Telegram fixo',async()=>{
  const e=await entrada();e.bot={nome:'BotImpresilk',username:'ExemploImpresilkBot',url:'https://nao-confiavel.invalid/privado'};
  const r=await projetarPesquisaLicitacoes(e,agora);
  assert.equal(r.bot.url,'https://t.me/ExemploImpresilkBot');
  for(const username of ['https://outro.invalid','../arquivo','curto!',''])await assert.rejects(projetarPesquisaLicitacoes({...e,bot:{nome:'BotImpresilk',username}},agora),/indisponível/);
  assert.deepEqual(await projetarPesquisaLicitacoes({estado:'sem_relatorio',bot:e.bot},agora),{estado:'sem_relatorio',bot:r.bot});
});
