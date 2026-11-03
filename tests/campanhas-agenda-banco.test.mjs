import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';
import { projetarCampanhas } from '../supabase/functions/_shared/campanhas-planejamento.mjs';

// Só o transporte PostgREST e a sessão são substituídos. O PostgreSQL local
// recebe os filtros emitidos pela porta e o schema real, sem coluna apagado.
const ler = caminho => readFileSync(new URL(caminho, import.meta.url), 'utf8');
const schema = ler('../supabase/migrations/0001_init.sql').match(/create table if not exists public\.painel_registros\s*\([\s\S]*?\n\);/)[0];
const source = transformSync(ler('../supabase/functions/painel-agenda/index.ts').replace(/^import .*;\s*$/gm, ''), { loader: 'ts', target: 'es2022' }).code;
let db;
before(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; ${schema}
    create table registros (id text primary key, colecao text, registro jsonb, apagado boolean not null default false);
    create table pcp_registros (like registros including all);`);
  await db.exec(ler('../supabase/migrations/20260906_lixeira_registros.sql'));
});
beforeEach(async () => { await db.exec('truncate painel_registros, registros, pcp_registros'); });
after(async () => { await db?.close(); });

const campanha = (id, campos = {}) => ({
  id, nome: 'Campanha fictícia', planejamento: { acoes: [
    { id: 'acao-teste', titulo: 'Preparar materiais', responsavel: 'Equipe exemplo', data: '2026-11-20', calendario: true, status: 'pendente' },
  ] }, ...campos,
});
async function inserir(itens, colecao = 'campanhas') {
  await db.query('insert into painel_registros(colecao,id,registro) select $1, item->>\'id\', item from jsonb_array_elements($2::jsonb) item', [colecao, JSON.stringify(itens)]);
}
function porta({ perms = ['campanhas', 'calendario-empresa'], revogado = false, falharPagina = 0 } = {}) {
  const consultas = [];
  const erros = [];
  let handler;
  const identificador = valor => { assert.match(valor, /^[a-z_]+$/); return `"${valor}"`; };
  const sb = { from(tabela) {
    const filtros = [], valores = [];
    let campos, ordem;
    const filtrar = (coluna, operador, valor) => { valores.push(valor); filtros.push(`${identificador(coluna)} ${operador} $${valores.length}`); return q; };
    const q = {
      select(valor) { assert.match(valor, /^id,\s*registro$/); campos = valor; return q; },
      eq(coluna, valor) { return filtrar(coluna, '=', valor); },
      gt(coluna, valor) { return filtrar(coluna, '>', valor); },
      order(coluna, opcoes) { ordem = `${identificador(coluna)} ${opcoes?.ascending === false ? 'desc' : 'asc'}`; return q; },
      async limit(limite) {
        consultas.push({ tabela, filtros: [...filtros], valores: [...valores], limite });
        if (consultas.length === falharPagina) return { data: null, error: { message: 'Erro privado de teste' } };
        try {
          const r = await db.query(`select ${campos} from ${identificador(tabela)} where ${filtros.join(' and ')} order by ${ordem} limit $${valores.length + 1}`, [...valores, limite]);
          return { data: r.rows, error: null };
        } catch (error) { return { data: null, error }; }
      },
    };
    return q;
  } };
  const contexto = vm.createContext({
    Deno: { env: { get: () => 'teste' }, serve: f => { handler = f; } },
    createClient: () => sb, verificarJwt: async () => ({ sub: 'pessoa-teste', perms }), crachaRevogado: async () => revogado,
    projetarCampanhas, Request, Response, console: { error: (...args) => erros.push(args.join(' ')) },
  });
  vm.runInContext(source, contexto);
  return {
    consultas, erros, lerColecao: vm.runInContext('lerColecao', contexto),
    call: (mes = '2026-11') => handler(new Request('https://exemplo.invalid', { method: 'POST', headers: { Authorization: 'Bearer teste' }, body: JSON.stringify({ action: 'campanhas', mes }) })),
  };
}

test('Campanhas lê schema do Painel sem apagado e projeta só ações abertas do mês', async () => {
  await inserir([
    campanha('campanha-aberta'), campanha('campanha-encerrada', { encerrada: true }),
    ...[
      { status: 'concluida' }, { status: 'cancelada' }, { calendario: false }, { data: '2026-12-20' },
    ].map((patch, i) => campanha(`campanha-fora-${i}`, { planejamento: { acoes: [{ ...campanha('x').planejamento.acoes[0], ...patch }] } })),
  ]);
  await inserir([campanha('outra-colecao')], 'outra');
  const p = porta(), resposta = await p.call();
  assert.equal(resposta.status, 200, p.erros.join('\n'));
  assert.deepEqual((await resposta.json()).eventos, [{
    id: 'campanha:campanha-aberta:acao-teste', data: '2026-11-20', titulo: 'Preparar materiais', tipo: 'Campanha', cor: '#7c3aed', origem: 'campanhas',
    descricao: 'Campanha fictícia · Equipe exemplo', href: '/campanhas?campanha=campanha-aberta',
  }]);
});

test('retirada para lixeira sai do calendário e restauração recupera o mesmo evento', async () => {
  await inserir([campanha('campanha-exemplo')]);
  const antes = await (await porta().call()).json();
  assert.equal(antes.eventos?.length, 1);
  await db.query('select painel_registro_retirar($1,$2,$3)', ['campanhas', 'campanha-exemplo', 'pessoa-teste']);
  assert.deepEqual((await (await porta().call()).json()).eventos, []);
  await db.query('select painel_registro_recuperar($1)', ['campanhas:campanha-exemplo']);
  assert.deepEqual((await (await porta().call()).json()).eventos, antes.eventos);
});

test('lê campanhas além da primeira página e preserva ID da linha quando ausente no JSON', async () => {
  await inserir(Array.from({ length: 501 }, (_, i) => campanha(`campanha-${String(i).padStart(4, '0')}`)));
  await db.query("update painel_registros set registro=registro-'id' where id=$1", ['campanha-0500']);
  const p = porta(), resposta = await p.call();
  assert.equal(resposta.status, 200, p.erros.join('\n'));
  const { eventos } = await resposta.json();
  assert.equal(eventos.length, 501);
  assert.equal(new Set(eventos.map(e => e.id)).size, 501);
  assert.equal(eventos.at(-1).id, 'campanha:campanha-0500:acao-teste');
  assert.equal(p.consultas.length, 2);
});

test('sem as duas permissões ou com sessão revogada não consulta campanhas', async () => {
  for (const perms of [[], ['campanhas'], ['calendario-empresa']]) {
    const p = porta({ perms });
    assert.equal((await p.call()).status, 403);
    assert.equal(p.consultas.length, 0);
  }
  const p = porta({ revogado: true });
  assert.equal((await p.call()).status, 401);
  assert.equal(p.consultas.length, 0);
});

test('filtro de apagados continua obrigatório nas tabelas de RH e PCP', async () => {
  for (const tabela of ['registros', 'pcp_registros']) {
    await db.query(`insert into ${tabela}(id,colecao,registro,apagado) values ('ativo','teste','{}',false),('retirado','teste','{}',true)`);
    const registros = await porta().lerColecao(tabela, 'teste');
    assert.deepEqual(Array.from(registros, r => r.id), ['ativo']);
  }
});

test('falha depois da primeira página não devolve calendário parcial nem erro privado', async () => {
  await inserir(Array.from({ length: 501 }, (_, i) => campanha(`campanha-${String(i).padStart(4, '0')}`)));
  const p = porta({ falharPagina: 2 }), resposta = await p.call();
  assert.equal(resposta.status, 500);
  assert.equal(p.consultas.length, 2);
  const corpo = await resposta.json();
  assert.equal(corpo.eventos, undefined);
  assert.doesNotMatch(JSON.stringify(corpo), /Erro privado/);
});
