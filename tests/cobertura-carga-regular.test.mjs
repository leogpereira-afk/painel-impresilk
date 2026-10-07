import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { janelasHistoricas } from '../supabase/functions/_shared/carteira-historica.mjs';
import { apurarComercial } from '../supabase/functions/_shared/comercial.mjs';

const script = new URL('../scripts/carregar-cache.mjs', import.meta.url).href;
const anterior = {
  versao: 1,
  tentativa: { id: 'manual', estado: 'concluida', desde: '2020-01-01', ate: '2026-10-07' },
  janelas: {
    ordens: [{ desde: '2020-01-01', ate: '2026-10-07', concluidaEm: '2026-10-07T18:00:00Z' }],
    orcamentos: [{ desde: '2026-01-01', ate: '2026-10-07', concluidaEm: '2026-10-07T18:00:00Z' }],
  },
};

function rodar(opcoes = {}) {
  const programa = `
    const opcoes = ${JSON.stringify(opcoes)};
    const RealDate = Date;
    globalThis.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : ['2026-10-08T15:00:00Z'])); }
      static now() { return new RealDate('2026-10-08T15:00:00Z').getTime(); }
    };
    const cache = {
      status: {ultimaCompleta:'2026-10-08T06:00:00Z'},
      comercial_carga_status: ${JSON.stringify(anterior)},
      orcamentos:[{id:'orc-antigo', dataCadastro:'2026-01-02', valor:100, situacao:'aberto'}],
      ordens:[{id:'os-antiga', data:'2026-01-02', valor:100, valorBruto:100, tipo:'Normal', clienteId:'c', itens:[]}],
      recebidos_os: {},
    };
    if (opcoes.lacuna) cache.comercial_carga_status.janelas.ordens[0].ate = '2024-12-31';
    if (opcoes.emExecucao) cache.comercial_carga_status.tentativa.estado = 'executando';
    const tabela = {'os-cancelada':{id:'os-cancelada',valor:321,comercial:{tipo:'Normal',clienteId:'c',cancelada:false}}};
    const gravacoes = [], consultas = [];
    globalThis.fetch = async (url, init) => {
      const u = new URL(url);
      if (u.hostname === 'cache.exemplo.invalid') {
        const body = JSON.parse(init.body);
        if (body.action === 'ler') return Response.json(body.chave === 'status' ? {status:cache.status} : {valor:cache[body.chave] ?? null, existe:body.chave in cache});
        gravacoes.push(body);
        if (body.action === 'ordens') {
          if (opcoes.tabelaFalha) return new Response('{}',{status:500});
          if (!opcoes.tabelaParcial) for (const o of body.linhas) tabela[o.id] = {...tabela[o.id],...o};
          return Response.json({gravadas:opcoes.tabelaParcial ? 0 : body.linhas.length});
        }
        if (body.action === 'ordensComercialCanceladas') {
          if (opcoes.cancelamentoFalha) return new Response('{}',{status:500});
          for (const id of body.ids) if (tabela[id]) tabela[id].comercial.cancelada = true;
          return Response.json({ok:true,marcadas:body.ids.filter(id=>tabela[id]).length});
        }
        if (body.action === 'ordensApagar') return Response.json({ok:true});
        if (body.chave === opcoes.recusa) return Response.json({recusouVazio:true,pulou:'recusado'});
        cache[body.chave] = body.valor;
        return Response.json({ok:true});
      }
      if (u.hostname !== 'mubi.exemplo.invalid') throw new Error('Rede real proibida no teste');
      const recurso = u.pathname.split('/').at(-1);
      consultas.push({recurso,query:Object.fromEntries(u.searchParams)});
      if (recurso === opcoes.falha) return new Response('{}',{status:500});
      const linha = {id:recurso+'-nova',tipo:'Normal',cliente_id:'c',cliente_nome:'Cliente',data_cadastro:'2026-10-08',status:'ABERTO',valor_total:100,itens:[]};
      const data = recurso === 'orcamento' || recurso === 'ordem-servico' ? [linha] : recurso === 'produto' ? [{nome:'Placa',categoria:'Sinalização'}] : [];
      if (opcoes.cancelada && recurso === 'ordem-servico') data.push({...linha,id:'os-cancelada',data_cadastro:'2025-06-01',status:'CANCELADO'});
      return Response.json({data,pagination:{current_page:1,last_page:1}});
    };
    if (opcoes.completo) process.argv.push('--completo');
    process.on('beforeExit', () => console.log('RESULTADO_TESTE:'+JSON.stringify({cache,gravacoes,consultas,tabela})));
    await import(${JSON.stringify(script)});
  `;
  const resultado = spawnSync(process.execPath, ['--input-type=module', '-e', programa], {
    encoding: 'utf8', timeout: 20000,
    env: { ...process.env, TZ: 'UTC', PAINEL_TOKEN: 'ficticio', PAINEL_CACHE_URL: 'https://cache.exemplo.invalid', MUBI_BASE_URL: 'https://mubi.exemplo.invalid/api', MUBI_PUBLIC_KEY: 'ficticia', MUBI_TOKEN: 'ficticio', MUBI_ESPERA_MS: '1' },
  });
  assert.equal(resultado.status, 0, resultado.stderr);
  const linha = resultado.stdout.split('\n').find(l => l.startsWith('RESULTADO_TESTE:'));
  assert.ok(linha, resultado.stdout);
  return JSON.parse(linha.slice('RESULTADO_TESTE:'.length));
}

test('carga diária prolonga cobertura confirmada na virada do dia sem refazer o histórico', () => {
  const r = rodar(), status = r.cache.comercial_carga_status;
  assert.deepEqual(janelasHistoricas(status), [{desde:'2020-01-01',ate:'2026-10-08'}]);
  assert.deepEqual(janelasHistoricas(status,'orcamentos'), [{desde:'2026-01-01',ate:'2026-10-08'}]);
  assert.deepEqual(status.tentativa, anterior.tentativa);
  for (const fonte of ['ordens','orcamentos']) {
    assert.deepEqual(status.janelas[fonte][0], anterior.janelas[fonte][0]);
    assert.equal(status.janelas[fonte].at(-1).desde,'2026-10-01');
    assert.equal(status.janelas[fonte].at(-1).ate,'2026-10-08');
  }
  const report = apurarComercial({ordens:[],orcamentos:[],clientes:[],acoes:[],cobertura:{janelas:janelasHistoricas(status)},coberturaOrcamentos:{janelas:janelasHistoricas(status,'orcamentos')}}, {de:'2026-10-01',ate:'2026-10-08'}, '2026-10-08');
  assert.equal(report.completo,true);
  assert.equal(report.valorAberto,0);
  assert.equal(report.comparativo.completo,true);
  assert.ok(r.gravacoes.findIndex(g=>g.chave==='comercial_carga_status') > r.gravacoes.findIndex(g=>g.action==='ordens'));
});

test('completa confirma somente a janela consultada, sem reconfirmar orçamentos preservados de outros anos', () => {
  const r=rodar({completo:true}), status=r.cache.comercial_carga_status;
  assert.equal(status.janelas.ordens.at(-1).desde,'2025-01-01');
  assert.equal(status.janelas.orcamentos.at(-1).desde,'2026-01-01');
  assert.equal(status.janelas.ordens.at(-1).ate,'2026-10-08');
  assert.equal(status.janelas.orcamentos.at(-1).ate,'2026-10-08');
});

for (const opcoes of [{falha:'ordem-servico'}, {recusa:'ordens'}, {tabelaFalha:true}, {tabelaParcial:true}]) test(`falha de ordens não confirma O.S. e mantém cobertura independente de orçamentos: ${JSON.stringify(opcoes)}`, () => {
  const r=rodar(opcoes), status=r.cache.comercial_carga_status;
  assert.deepEqual(status.janelas.ordens, anterior.janelas.ordens);
  assert.equal(janelasHistoricas(status,'orcamentos')[0].ate,'2026-10-08');
});

for (const opcoes of [{falha:'orcamento',completo:true}, {recusa:'orcamentos'}]) test(`falha de orçamentos não confirma propostas nem impede confirmação das O.S.: ${JSON.stringify(opcoes)}`, () => {
  const r=rodar(opcoes), status=r.cache.comercial_carga_status;
  assert.deepEqual(status.janelas.orcamentos, anterior.janelas.orcamentos);
  assert.equal(janelasHistoricas(status)[0].ate,'2026-10-08');
});

test('carga completa marca cancelada existente antes de confirmar e preserva cabeçalho financeiro', () => {
  const r=rodar({completo:true,cancelada:true});
  assert.deepEqual(r.tabela['os-cancelada'], {id:'os-cancelada',valor:321,comercial:{tipo:'Normal',clienteId:'c',cancelada:true}});
  assert.equal(r.gravacoes.some(g=>g.action==='ordensApagar'),false);
  assert.ok(r.gravacoes.findIndex(g=>g.action==='ordensComercialCanceladas') < r.gravacoes.findIndex(g=>g.chave==='comercial_carga_status'));
  assert.equal(janelasHistoricas(r.cache.comercial_carga_status)[0].ate,'2026-10-08');
});

test('falha na marcação de cancelamento da completa impede confirmação de O.S.', () => {
  const r=rodar({completo:true,cancelada:true,cancelamentoFalha:true});
  assert.deepEqual(r.cache.comercial_carga_status.janelas.ordens,anterior.janelas.ordens);
  assert.equal(janelasHistoricas(r.cache.comercial_carga_status,'orcamentos')[0].ate,'2026-10-08');
});

test('carga regular não preenche lacunas fora da consulta nem encerra tentativa manual', () => {
  const r=rodar({lacuna:true,emExecucao:true}), status=r.cache.comercial_carga_status;
  assert.deepEqual(janelasHistoricas(status), [{desde:'2020-01-01',ate:'2024-12-31'},{desde:'2026-10-01',ate:'2026-10-08'}]);
  assert.equal(status.tentativa.estado,'executando');
});

test('recusa do comprovante preserva cobertura anterior e aparece no estado da carga', () => {
  const r=rodar({recusa:'comercial_carga_status'});
  assert.deepEqual(r.cache.comercial_carga_status,anterior);
  assert.ok(r.cache.status.fontesQueFalharam.includes('comercial_carga_status'));
});
