import test from 'node:test';
import assert from 'node:assert/strict';
import {consultarPesquisaLicitacoes,projetarPesquisaLicitacoes,projetarHistoricoLicitacoes,hashPesquisa,URL_PESQUISA_LICITACOES,MAX_BYTES_PESQUISA} from '../supabase/functions/_shared/licitacoes-pesquisa.mjs';
import {gerarRelatorio} from '../supabase/functions/_shared/licitacoes-controle.mjs';
import {enriquecerEditaisLicitacoes} from '../supabase/functions/_shared/licitacoes-fontes-edital.mjs';
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
test('retidos têm detalhes sem promover classificação ou cobertura',async()=>{
  const e=await entrada();e.registro.dossie.candidatos=[{id:'pendente-ficticio',processo:'Processo fictício A',orgao:'Órgão exemplo',produto:'Adesivo',item:'4',prazo:'Dia divulgado, hora a confirmar',oficialUrl:'https://example.gov.br/edital',classificacao:'GO',justificativa:'Conferência pendente',exigencias:['Anexo pendente'],localExecucao:{municipios:['Montes Claros'],apenasSede:true,evidencia:'Somente sede identificada'}}];
  e.registro.hash_sha256=await hashPesquisa(e.registro.dossie);
  const r=await projetarPesquisaLicitacoes(e,agora);assert.equal(r.oportunidades.length,0);assert.equal(r.cobertura.concluidos,0);
  assert.equal(r.candidatosRetidos[0].processo,'Processo fictício A');assert.equal(r.candidatosRetidos[0].classificacao,undefined);assert.equal(r.candidatosRetidos[0].municipiosAbrangidos,undefined);
  assert.equal(r.candidatosRetidos[0].localExecucaoRegistrado.apenasSede,true);assert.ok(r.candidatosRetidos[0].motivos.length);assert.equal(r.candidatosRetidos[0].prazo,'Dia divulgado, hora a confirmar');
  e.registro.dossie.candidatos[0].oficialUrl='javascript:alert(1)';e.registro.hash_sha256=await hashPesquisa(e.registro.dossie);assert.equal((await projetarPesquisaLicitacoes(e,agora)).candidatosRetidos[0].oficialUrl,'');
});
test('publica datas com fuso e checklist rastreável, preservando dossiês antigos', async () => {
  const e = await entrada();
  const fonteUrl = 'https://example.gov.br/edital.pdf';
  const dadosEdital = {
    datasEdital: { sessaoPublica: { dataHora: '2026-10-14T09:15:00-03:00', fonteUrl, referencia: 'Preâmbulo' } },
    documentosEdital: [{ nome: 'Habilitação jurídica', categoria: 'habilitacao', orientacao: 'Anexar ato constitutivo vigente.',
      referencia: 'Item 7.4, p. 16', fonteUrl, escopo: 'processo' }],
  };
  const candidato = { id: 'pendente-ficticio', processo: 'Processo exemplo', orgao: 'Órgão exemplo', exigencias: ['Medidas do item.'] };
  async function projetar(candidatoAtual) {
    e.registro.dossie.candidatos = [candidatoAtual];
    e.registro.hash_sha256 = await hashPesquisa(e.registro.dossie);
    return (await projetarPesquisaLicitacoes(e, agora)).candidatosRetidos[0];
  }
  const legado = await projetar(candidato);
  assert.equal(legado.datasEdital, undefined);
  assert.equal(legado.documentosEdital, undefined);
  assert.deepEqual(legado.exigencias, candidato.exigencias);
  const completo = await projetar({ ...candidato, ...dadosEdital });
  assert.deepEqual(completo.datasEdital, dadosEdital.datasEdital);
  assert.deepEqual(completo.documentosEdital, dadosEdital.documentosEdital);
  for (const sobrescrita of [{ fonteUrl: 'https://127.0.0.1/privado' }, { modeloUrl: 'javascript:alert(1)' }, { referencia: '' }, { campoPrivado: 'dado' }]) {
    const documentosEdital = [{ ...dadosEdital.documentosEdital[0], ...sobrescrita }];
    await assert.rejects(projetar({ ...candidato, ...dadosEdital, documentosEdital }), /indisponível/);
  }
  for (const dataHora of ['2026-02-31T09:15:00-03:00', '2026-10-14T09:15:00']) {
    const datasEdital = { sessaoPublica: { dataHora, fonteUrl } };
    await assert.rejects(projetar({ ...candidato, ...dadosEdital, datasEdital }), /indisponível/);
  }
});
test('leitura atual enriquece o mesmo processo uma vez, com fontes fixas e sem repassar credencial', async () => {
  const e = await entrada();
  const cnpj = '10000000000003', ano = 2026, sequencial = 31;
  const numeroControlePNCP = `${cnpj}-1-000031/${ano}`;
  const orgaoPath = `/orgaos/${cnpj}/compras/${ano}/${sequencial}`;
  const caminhoPortal = '/MG/Municipio-exemplo-1/RPE-01-2026-2026-123';
  const linkSistemaOrigem = `https://www.portaldecompraspublicas.com.br/processos${caminhoPortal}`;
  e.registro.dossie.candidatos = [
    { id: 'ficticio-1', processo: `Processo exemplo · PNCP ${numeroControlePNCP}`, prazo: '2026-10-14T12:00:00Z' },
    { id: 'ficticio-2', oficialUrl: `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${sequencial}` },
    { id: 'ambiguo', processo: numeroControlePNCP, oficialUrl: `https://pncp.gov.br/app/editais/${cnpj}/${ano}/32` },
    { id: 'sem-identificador', oficialUrl: 'https://example.gov.br/edital' },
  ];
  e.registro.hash_sha256 = await hashPesquisa(e.registro.dossie);
  const chamadas = [];
  async function fetcher(url, opcoes) {
    chamadas.push(url);
    const parsed = new URL(url);
    if (parsed.hostname.endsWith('.supabase.co')) {
      assert.equal(opcoes.headers['x-licitacoes-painel-token'], 'sintetico');
      return Response.json(e);
    }
    assert.deepEqual(opcoes.headers, { accept: 'application/json' });
    assert.equal(opcoes.redirect, 'error');
    if (parsed.pathname === '/api/consulta/v1' + orgaoPath) {
      return Response.json({ numeroControlePNCP, situacaoCompraId: 1, dataAberturaProposta: '2026-10-10T09:00:00',
        dataEncerramentoProposta: '2026-10-14T09:00:00', linkSistemaOrigem });
    }
    if (parsed.pathname === '/api/pncp/v1' + orgaoPath + '/arquivos') {
      const arquivo = { cnpj, anoCompra: ano, sequencialCompra: sequencial, statusAtivo: true,
        sequencialDocumento: 1, titulo: 'Edital exemplo', tipoDocumentoNome: 'Edital', url: 'https://example.gov.br/ignorar' };
      return Response.json([arquivo, { ...arquivo, statusAtivo: false, sequencialDocumento: 2, titulo: 'Antigo' },
        { ...arquivo, sequencialCompra: 32, sequencialDocumento: 3, titulo: 'Outro' }]);
    }
    assert.equal(parsed.origin, 'https://compras.api.portaldecompraspublicas.com.br');
    assert.equal(parsed.pathname, '/v2/licitacao' + caminhoPortal);
    return Response.json({ codigoLicitacao: 123, dataHoraAbertura: '2026-10-14T12:15:00Z',
      dataHoraFinalRecebimentoPropostas: '2026-10-14T12:00:00Z' });
  }
  const r = await consultarPesquisaLicitacoes({ token: 'sintetico', agora: () => agora, fetcher });
  assert.equal(chamadas.length, 4);
  const [primeiro, segundo, ambiguo, semIdentificador] = r.candidatosRetidos;
  assert.equal(primeiro.prazo, '2026-10-14T12:00:00Z');
  assert.equal(primeiro.datasEdital.envioProposta.dataHora, '2026-10-14T09:00:00-03:00');
  assert.equal(primeiro.datasEdital.sessaoPublica.dataHora, '2026-10-14T12:15:00Z');
  assert.equal(primeiro.datasEdital.sessaoPublica.fonteUrl, linkSistemaOrigem);
  assert.equal(primeiro.datasEdital.credenciamento, undefined);
  assert.deepEqual(segundo.datasEdital, primeiro.datasEdital);
  assert.deepEqual(primeiro.arquivosEdital, [{ nome: 'Edital exemplo', tipo: 'Edital',
    url: `https://pncp.gov.br/api/pncp/v1${orgaoPath}/arquivos/1` }]);
  assert.equal(primeiro.documentosEdital, undefined);
  assert.equal(ambiguo.datasEdital, undefined);
  assert.equal(semIdentificador.datasEdital, undefined);
  const historico = await consultarPesquisaLicitacoes({ token: 'sintetico', id: e.registro.id, agora: () => agora, fetcher });
  assert.equal(chamadas.length, 5);
  assert.equal(historico.candidatosRetidos[0].datasEdital, undefined);
});
test('exibe situação PNCP interrompida e evita sugerir datas atuais', async () => {
  const numeroControlePNCP = '10000000000003-1-000031/2026';
  for (const [codigo, nome] of [[2, 'Revogada'], [3, 'Anulada'], [4, 'Suspensa']]) {
    const pesquisa = { oportunidades: [{ processo: numeroControlePNCP }], candidatosRetidos: [] };
    const fonteUrl = 'https://pncp.gov.br/api/consulta/v1/orgaos/10000000000003/compras/2026/31';
    const fetcher = async url => url.endsWith('/arquivos') ? Response.json([]) : Response.json({
      numeroControlePNCP, situacaoCompraId: codigo, dataEncerramentoProposta: '2026-10-14T09:00:00',
    });
    const r = await enriquecerEditaisLicitacoes(pesquisa, { fetcher, signal: AbortSignal.timeout(1000) });
    assert.deepEqual(r.oportunidades[0].situacaoEdital, { codigo, nome, fonteUrl });
    assert.equal(r.oportunidades[0].datasEdital, undefined);
  }
});
test('a consulta de edital com fonte travada devolve a pesquisa original no cancelamento', async () => {
  const pesquisa = { oportunidades: [{ processo: '10000000000003-1-000031/2026', prazo: '2026-10-14T09:00:00-03:00' }], candidatosRetidos: [] };
  const anterior = structuredClone(pesquisa);
  const controller = new AbortController();
  const pendente = enriquecerEditaisLicitacoes(pesquisa, { signal: controller.signal, fetcher: async () => new Promise(() => {}) });
  controller.abort();
  assert.deepEqual(await pendente, anterior);
});
test('histórico permite só metadados e rejeita páginas ou resumos inconsistentes',async()=>{
  const {dossie,...row}=(await entrada()).registro;assert.ok(dossie);
  const h={estado:'historico',registros:[row],pagina:1,temMais:false};assert.equal(projetarHistoricoLicitacoes(h,1).registros[0].id,row.id);
  for(const altered of [{...h,pagina:2},{...h,temMais:true},{...h,registros:[row,row]},{...h,registros:[{...row,dossie}]},{...h,registros:[{...row,periodo_de:'2026-02-31'}]}])assert.throws(()=>projetarHistoricoLicitacoes(altered,1),/indisponível/);
});
test('consulta por ID não substitui versão ausente ou resposta de outro relatório',async()=>{
  let url;
  const r=await consultarPesquisaLicitacoes({token:'teste',id:'pesquisa-ficticia',agora:()=>agora,fetcher:async(u)=>{url=u;return Response.json(await entrada());}});assert.equal(r.id,'pesquisa-ficticia');assert.equal(new URL(url).searchParams.get('id'),'pesquisa-ficticia');
  await assert.rejects(consultarPesquisaLicitacoes({token:'teste',id:'outro',agora:()=>agora,fetcher:async()=>Response.json(await entrada())}),/indisponível/);
  await assert.rejects(consultarPesquisaLicitacoes({token:'teste',id:'ausente',fetcher:async()=>new Response('',{status:404})}),e=>e.status===404);
  await assert.rejects(consultarPesquisaLicitacoes({token:'teste',id:'../x',fetcher:()=>assert.fail('não chamar')}),e=>e.status===400);
});
test('consulta histórico usa origem fixa e página validada',async()=>{
  let url;const r=await consultarPesquisaLicitacoes({token:'teste',historico:true,pagina:2,fetcher:async(u)=>{url=new URL(u);return Response.json({estado:'historico',registros:[],pagina:2,temMais:false});}});
  assert.equal(r.pagina,2);assert.equal(url.origin,new URL(URL_PESQUISA_LICITACOES).origin);assert.equal(url.searchParams.get('consulta'),'historico');assert.equal(url.searchParams.get('pagina'),'2');
});
