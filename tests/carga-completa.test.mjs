import test from 'node:test';
import assert from 'node:assert/strict';

process.env.MUBI_BASE_URL = 'https://mubi.exemplo.invalid/api';
process.env.MUBI_PUBLIC_KEY = 'publica-ficticia';
process.env.MUBI_TOKEN = 'credencial-ficticia';
process.env.MUBI_ESPERA_MS = '1';
const {etapaCompleta} = await import('../netlify/functions/mubi-cache-background.mjs');

const respostas = {
  orcamento: [{id:'orc-exemplo',status:'ABERTO',valor_total:1000,valor_desconto:100}],
  produto: [{nome:'Placa exemplo',categoria:'Sinalização'}],
  'ordem-servico': [
    {id:'os-exemplo',status:'APROVADO',valor_total:200,itens:[{item:'Placa exemplo',valor_final:200}]},
    {id:'os-cancelada',status:'CANCELADO',valor_total:100},
  ],
};

async function carregar(t, alteracoes={}, anteriores=[]) {
  t.mock.method(globalThis,'fetch',async url => {
    const recurso=new URL(url).pathname.split('/').at(-1);
    assert.ok(recurso in respostas, 'Somente as fontes fictícias previstas');
    const dados=alteracoes[recurso] ?? respostas[recurso];
    if(typeof dados==='number') return new Response('{}',{status:dados});
    return Response.json({data:dados,pagination:{current_page:1,last_page:1}});
  });
  return etapaCompleta(anteriores);
}

test('catálogo 500 não descarta orçamento recebido nem inventa classificação',async t=>{
  const r=await carregar(t,{produto:500});
  assert.equal(r.orcamentos[0].valor,900);
  assert.equal(r.ordens[0].valor,200);
  assert.equal(r.ordens[0].itens[0].categoria,'');
  assert.deepEqual(r.falhas,['catalogo-indisponivel']);
});

test('catálogo vazio permite atualizar valores sem inventar categorias',async t=>{
  const r=await carregar(t,{produto:[]});
  assert.equal(r.orcamentos[0].id,'orc-exemplo');
  assert.equal(r.ordens[0].valor,200);
  assert.equal(r.ordens[0].itens[0].categoria,'');
  assert.deepEqual(r.falhas,['catalogo-indisponivel']);
});

test('falha dos orçamentos não impede ordens classificadas',async t=>{
  const r=await carregar(t,{orcamento:500});
  assert.equal(r.orcamentos,null);
  assert.deepEqual(r.ordens.map(x=>x.id),['os-exemplo']);
  assert.equal(r.ordens[0].itens[0].categoria,'Sinalização');
  assert.deepEqual(r.falhas,['orcamentos']);
});

test('falha das ordens não descarta os orçamentos',async t=>{
  const r=await carregar(t,{'ordem-servico':500});
  assert.equal(r.orcamentos[0].valor,900);
  assert.equal(r.ordens,null);
  assert.deepEqual(r.falhas,['ordens']);
});

test('carga válida mantém descontos e exclui ordens canceladas',async t=>{
  const r=await carregar(t);
  assert.equal(r.orcamentos[0].valor,900);
  assert.deepEqual(r.ordens.map(x=>x.id),['os-exemplo']);
  assert.equal(r.ordens[0].itens[0].categoria,'Sinalização');
  assert.deepEqual(r.falhas,[]);
});

test('duas fontes indisponíveis devolvem ausência, nunca listas vazias',async t=>{
  const r=await carregar(t,{orcamento:500,'ordem-servico':500});
  assert.equal(r.orcamentos,null);
  assert.equal(r.ordens,null);
  assert.deepEqual(new Set(r.falhas),new Set(['orcamentos','ordens']));
});

 test('correção de valor antigo chega mesmo sem catálogo e conserva a categoria conhecida',async t=>{
  const anteriores=[{id:'os-exemplo',valor:900,itens:[{produto:'Placa exemplo',categoria:'Sinalização'}]}];
  const r=await carregar(t,{produto:500},anteriores);
  assert.equal(r.ordens[0].valor,200);
  assert.equal(r.ordens[0].itens[0].categoria,'Sinalização');
  assert.equal(anteriores[0].valor,900);
});
