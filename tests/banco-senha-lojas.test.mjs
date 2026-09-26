/* A MIGRACAO DAS SENHAS (20260926a_senha_em_todos.sql) num Postgres de
 * verdade: PGlite, em memoria. Nao encosta no Supabase.
 *
 * Precisa do pacote @electric-sql/pglite. O Painel nao o tem como dependencia;
 * aponte para uma instalacao que exista na maquina:
 *   PGLITE_PATH=/caminho/para/@electric-sql/pglite/dist/index.js node --test tests/
 * (neste Mac: ~/Projetos/metodo-vof/node_modules/@electric-sql/pglite/dist/index.js)
 * Sem ele, os testes PULAM dizendo o motivo: nao passam calados.
 *
 * As tabelas abaixo sao o MINIMO do schema de producao que a migracao toca,
 * com os privilegios padrao que o Supabase da a anon e authenticated em toda
 * funcao nova. Casos ruins primeiro.
 */
import { test, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

let PGlite = null;
try {
  ({ PGlite } = await import("@electric-sql/pglite"));
} catch {
  if (process.env.PGLITE_PATH) ({ PGlite } = await import(pathToFileURL(process.env.PGLITE_PATH).href));
}
const pular = PGlite ? false : "PGlite ausente: defina PGLITE_PATH (ver o topo deste arquivo)";
const MIGRACAO = await readFile(new URL("../supabase/migrations/20260926a_senha_em_todos.sql", import.meta.url), "utf8");

const PESSOA = "11111111-1111-4111-8111-111111111111";
const FUNCAO = "22222222-2222-4222-8222-222222222222";
const H = (x) => ({ hash: x.padEnd(64, "0"), salt: "5".repeat(32), iter: 120000 });
const NOVO = H("abc");

let db;
if (PGlite) {
  before(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
      create type acesso_tipo_conta as enum ('pessoa', 'funcao', 'terceirizado');
      create table public.acesso_conta (
        id uuid primary key default gen_random_uuid(), usuario text not null unique, nome text not null default '',
        tipo acesso_tipo_conta not null default 'pessoa', colaborador text not null default '', colaborador_id text,
        auth_user_id uuid, ativo boolean not null default true, atualizado_em timestamptz not null default now());
      create table public.acesso_senha_legado (
        conta_id uuid not null references public.acesso_conta(id) on delete cascade, origem text not null,
        hash text not null, salt text not null, iter int not null default 120000, usado_em timestamptz,
        primary key (conta_id, origem));
      create table public.equipe_contas (
        sistema text not null check (sistema in ('brief','pcp','compras','dre','pops','vof')), usuario text not null,
        nome text, papel text not null, ativo boolean not null default true, hash text not null, salt text not null,
        iter integer not null, trocar_senha boolean not null default false, atualizado_em timestamptz not null default now(),
        primary key (sistema, usuario));
      create table public.painel_contas (
        usuario text primary key, nome text, permissoes jsonb not null default '[]', vendedor_id text default '',
        hash text not null, salt text not null, iter integer not null, atualizado_em timestamptz not null default now());
      insert into public.acesso_conta (id, usuario, nome, tipo) values
        ('${PESSOA}', 'ficticia', 'Pessoa Fictícia', 'pessoa'), ('${FUNCAO}', 'montagem', 'Porta da montagem', 'funcao');
      insert into public.equipe_contas (sistema, usuario, nome, papel, ativo, hash, salt, iter, trocar_senha) values
        ('pcp', 'ficticia', 'Fictícia', 'operador', true, '${"1".repeat(64)}', '${"2".repeat(32)}', 120000, false),
        ('brief', 'fict', 'Fict', 'vendedor', false, '${"3".repeat(64)}', '${"4".repeat(32)}', 120000, false),
        ('pops', 'outra', 'Outra pessoa', 'equipe', true, '${"6".repeat(64)}', '${"7".repeat(32)}', 120000, false);
      insert into public.painel_contas (usuario, nome, permissoes, vendedor_id, hash, salt, iter) values
        ('ficticia', 'Fictícia', '["orcamentos"]', 'vend-1', '${"8".repeat(64)}', '${"9".repeat(32)}', 120000);
      insert into public.acesso_senha_legado (conta_id, origem, hash, salt, iter) values
        ('${PESSOA}', 'equipe:pcp', '${"1".repeat(64)}', '${"2".repeat(32)}', 120000),
        ('${PESSOA}', 'painel', '${"8".repeat(64)}', '${"9".repeat(32)}', 120000);
    `);
    await db.exec(MIGRACAO);
    await db.exec(MIGRACAO);   // idempotente: aplicar de novo nao pode falhar
  });
  after(async () => await db?.close());
  beforeEach(async () => await db.exec("begin"));
  afterEach(async () => await db.exec("rollback"));
}

const gravar = async (conta, equipe, painel, hash = NOVO, temporaria = true, origem = "direcao") =>
  (await db.query("select public.acesso_senha_gravar($1, $2, $3, $4, $5, $6) as r",
    [conta, equipe == null ? null : JSON.stringify(equipe), painel == null ? null : JSON.stringify(painel), JSON.stringify(hash), temporaria, origem])).rows[0].r;
const retrato = async () => JSON.stringify({
  e: (await db.query("select * from public.equipe_contas order by sistema, usuario")).rows,
  p: (await db.query("select * from public.painel_contas order by usuario")).rows,
  l: (await db.query("select conta_id, origem, hash from public.acesso_senha_legado order by conta_id, origem")).rows,
  c: (await db.query("select id, trocar_senha, senha_trocada_em from public.acesso_conta order by usuario")).rows,
});
// Um erro DENTRO da transacao do teste aborta a transacao: cada tentativa
// que deve falhar roda num savepoint, como a chamada do PostgREST faria.
async function falha(fn, padrao) {
  await db.exec("savepoint tentativa");
  try {
    await fn();
    assert.fail("devia ter recusado");
  } catch (e) {
    if (e?.code === "ERR_ASSERTION") throw e;
    if (padrao) assert.match(String(e.message), padrao);
  } finally {
    await db.exec("rollback to savepoint tentativa");
  }
}

test("um alvo que não existe desfaz a transação inteira", { skip: pular }, async () => {
  const antes = await retrato();
  await falha(() => gravar(PESSOA, [{ sistema: "pcp", usuario: "ficticia" }, { sistema: "compras", usuario: "ficticia" }], { usuario: "ficticia" }),
    /não existe a conta ficticia no compras/);
  assert.equal(await retrato(), antes);
});

test("nunca cria conta: nem em equipe_contas, nem no Painel sem `criar`", { skip: pular }, async () => {
  await falha(() => gravar(PESSOA, [], { usuario: "ninguem" }), /não existe a conta ninguem no Painel/);
  const { rows: [{ n }] } = await db.query("select count(*)::int as n from public.equipe_contas");
  await gravar(PESSOA, [{ sistema: "pcp", usuario: "ficticia" }], null);
  assert.equal((await db.query("select count(*)::int as n from public.equipe_contas")).rows[0].n, n);
});

test("`criar` no Painel: só na troca própria e só com acesso total", { skip: pular }, async () => {
  await falha(() => gravar(null, [], { usuario: "leonardo", criar: { nome: "Direção", permissoes: ["*"] } }, NOVO, false, "direcao"));
  await falha(() => gravar(null, [], { usuario: "leonardo", criar: { nome: "Direção", permissoes: ["orcamentos"] } }, NOVO, false, "propria"));
  await gravar(null, [], { usuario: "leonardo", criar: { nome: "Direção", permissoes: ["*"] } }, NOVO, false, "propria");
  const { rows: [c] } = await db.query("select * from public.painel_contas where usuario = 'leonardo'");
  assert.deepEqual(c.permissoes, ["*"]);
  assert.equal(c.hash, NOVO.hash);
});

test("recusa sistema sem loja, hash fraco, origem estranha e pessoa ausente fora da troca própria", { skip: pular }, async () => {
  for (const sistema of ["painel", "rh", "central", "dre", "bosques", "domo"]) {
    await falha(() => gravar(PESSOA, [{ sistema, usuario: "ficticia" }], null), /não recebe senha por aqui/);
  }
  await falha(() => gravar(PESSOA, [], null, { ...NOVO, iter: 99999 }), /hash inválido/);
  await falha(() => gravar(PESSOA, [], null, { ...NOVO, salt: "" }), /hash inválido/);
  await falha(() => gravar(PESSOA, [], null, NOVO, true, "central"), /origem inválida/);
  await falha(() => gravar(null, [], { usuario: "ficticia" }, NOVO, true, "direcao"), /só a própria troca/);
  await falha(() => gravar(null, [{ sistema: "pcp", usuario: "ficticia" }], null, NOVO, false, "propria"), /só a própria troca/);
  await falha(() => gravar(PESSOA, [{ sistema: "pcp", usuario: "ficticia" }, { sistema: "pcp", usuario: "ficticia" }], null), /repetida/);
  await falha(() => gravar("99999999-9999-4999-8999-999999999999", [], null), /pessoa não encontrada/);
});

test("só as colunas de senha mudam: papel, ativo, nome, módulos e vendedor idênticos", { skip: pular }, async () => {
  const campos = async () => JSON.stringify({
    e: (await db.query("select sistema, usuario, nome, papel, ativo from public.equipe_contas order by 1, 2")).rows,
    p: (await db.query("select usuario, nome, permissoes, vendedor_id from public.painel_contas order by 1")).rows,
  });
  const antes = await campos();
  await gravar(PESSOA, [{ sistema: "pcp", usuario: "ficticia" }, { sistema: "brief", usuario: "fict" }], { usuario: "ficticia" });
  assert.equal(await campos(), antes);
  const { rows } = await db.query("select sistema, hash, trocar_senha from public.equipe_contas order by sistema");
  assert.deepEqual(rows.map((r) => [r.sistema, r.hash === NOVO.hash, r.trocar_senha]),
    [["brief", true, true], ["pcp", true, true], ["pops", false, false]], "a conta de outra pessoa não é tocada");
});

test("a guarda da entrada vira UMA linha e a marca da pessoa fica a pedida", { skip: pular }, async () => {
  const r = await gravar(PESSOA, [{ sistema: "pcp", usuario: "ficticia" }], null, NOVO, true, "direcao");
  assert.equal(r.antes.legado.length, 2, "o antes guarda as linhas substituídas");
  const { rows } = await db.query(`select origem, hash from public.acesso_senha_legado where conta_id = '${PESSOA}'`);
  assert.deepEqual(rows, [{ origem: "direcao", hash: NOVO.hash }]);
  assert.equal((await db.query(`select trocar_senha from public.acesso_conta where id = '${PESSOA}'`)).rows[0].trocar_senha, true);
  await gravar(PESSOA, [], null, H("def"), false, "propria");
  assert.equal((await db.query(`select trocar_senha from public.acesso_conta where id = '${PESSOA}'`)).rows[0].trocar_senha, false);
});

test("gatilho: `direcao` e `central` marcam, `propria` limpa, e porta de função nunca é marcada", { skip: pular }, async () => {
  const marca = async (id) => (await db.query(`select trocar_senha, senha_trocada_em from public.acesso_conta where id = '${id}'`)).rows[0];
  for (const [origem, esperado] of [["central", true], ["propria", false], ["direcao", true], ["equipe:brief", false]]) {
    await db.query(`delete from public.acesso_senha_legado where conta_id = '${PESSOA}'`);
    await db.query(`insert into public.acesso_senha_legado (conta_id, origem, hash, salt) values ('${PESSOA}', $1, 'h', 's')`, [origem]);
    const m = await marca(PESSOA);
    assert.equal(m.trocar_senha, esperado, origem);
    assert.ok(m.senha_trocada_em, origem);
  }
  await db.query(`insert into public.acesso_senha_legado (conta_id, origem, hash, salt) values ('${FUNCAO}', 'central', 'h', 's')`);
  assert.equal((await marca(FUNCAO)).trocar_senha, false, "porta compartilhada");
  // O carimbo `usado_em` da entrada única não mexe na marca.
  await db.query(`update public.acesso_conta set trocar_senha = true where id = '${PESSOA}'`);
  await db.query(`update public.acesso_senha_legado set usado_em = now() where conta_id = '${PESSOA}'`);
  assert.equal((await marca(PESSOA)).trocar_senha, true);
});

test("repor devolve o antes, mas não atropela linha que mudou depois da gravação", { skip: pular }, async () => {
  const antes = await retrato();
  const r = await gravar(PESSOA, [{ sistema: "pcp", usuario: "ficticia" }, { sistema: "brief", usuario: "fict" }], { usuario: "ficticia" });
  // Alguém trocou a senha do Brief no meio (outra porta).
  await db.query(`update public.equipe_contas set hash = '${"f".repeat(64)}' where sistema = 'brief' and usuario = 'fict'`);
  const { rows: [{ x }] } = await db.query("select public.acesso_senha_repor($1, $2, $3) as x", [PESSOA, JSON.stringify(r.antes), NOVO.hash]);
  assert.deepEqual(x, { repostas: 3, puladas: 1 });
  const e = (await db.query("select sistema, hash, trocar_senha from public.equipe_contas order by sistema")).rows;
  assert.equal(e.find((l) => l.sistema === "brief").hash, "f".repeat(64), "a troca do outro ficou");
  assert.equal(e.find((l) => l.sistema === "pcp").hash, "1".repeat(64), "o resto voltou");
  assert.equal(e.find((l) => l.sistema === "pcp").trocar_senha, false);
  const depois = JSON.parse(await retrato());
  const eraAntes = JSON.parse(antes);
  assert.deepEqual(depois.p, eraAntes.p.map((p) => ({ ...p, atualizado_em: depois.p[0].atualizado_em })));
  assert.deepEqual(depois.l, eraAntes.l, "as duas linhas antigas da guarda voltaram");
  assert.deepEqual(depois.c, eraAntes.c, "a marca da pessoa voltou exata");
});

test("repor apaga a linha do Painel que a gravação criou", { skip: pular }, async () => {
  const r = await gravar(null, [], { usuario: "leonardo", criar: { nome: "Direção", permissoes: ["*"] } }, NOVO, false, "propria");
  await db.query("select public.acesso_senha_repor(null, $1, $2)", [JSON.stringify(r.antes), NOVO.hash]);
  assert.equal((await db.query("select count(*)::int as n from public.painel_contas where usuario = 'leonardo'")).rows[0].n, 0);
});

test("anon e authenticated não executam as funções (a chave anon é pública)", { skip: pular }, async () => {
  for (const papel of ["anon", "authenticated"]) {
    await db.exec(`set role ${papel}`);
    try {
      await falha(() => gravar(PESSOA, [], null), /permission denied/);
      await falha(() => db.query("select public.acesso_senha_repor(null, '{}'::jsonb, 'x')"), /permission denied/);
    } finally {
      await db.exec("reset role");
    }
  }
  await db.exec("set role service_role");
  try {
    await db.query("select public.acesso_senha_repor(null, '{}'::jsonb, 'x')");
  } finally {
    await db.exec("reset role");
  }
});
