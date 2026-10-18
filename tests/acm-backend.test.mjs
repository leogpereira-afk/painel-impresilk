import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createProject } from '../src/lib/acm/model.mjs';
import { ACMError, authorizeACM, currentACMSession, readACMIdentity, handleACM, createSupabaseACMRepository, assistantConfiguration, validateAIProposal } from '../supabase/functions/_shared/acm-handler.mjs';

const session = overrides => ({ sub: 'user-a', exp: Math.floor(Date.now() / 1000) + 3600, perms: ['ferramenta-ia'], ...overrides });
const rejectCode = (promise, code) => assert.rejects(promise, error => error instanceof ACMError && error.code === code);
const validAI = () => assistantConfiguration({ OPENAI_API_KEY: 'fictitious-test-key', ACM_AI_MODEL: 'explicit-test-model', ACM_AI_ENABLED: 'true', ACM_AI_MAX_OUTPUT_TOKENS: '500', ACM_AI_INPUT_USD_PER_MILLION: '1', ACM_AI_OUTPUT_USD_PER_MILLION: '1', ACM_AI_MAX_COST_USD: '0.1', ACM_AI_DAILY_USD: '1' });

test('handler denies absent, expired, revoked, provisional and wrong-module sessions before data access', async () => {
  let accessed = false; const repo = { list() { accessed = true; } };
  for (const denied of [null, session({ exp: 1 }), session({ exp: undefined }), session({ revoked: true }), session({ trocarSenha: true }), session({ perms: ['orcamentos'] }), session({ sub: '' })]) await assert.rejects(handleACM({ action: 'list' }, { session: denied, repo }), error => [401,403].includes(error.status));
  assert.equal(accessed, false);
  assert.equal(authorizeACM(session({ master: true, perms: [] })), 'user-a');
});

test('removing module access invalidates old JWT grants before repository or provider operations', async () => {
  const oldToken = session({ perms: ['ferramenta-ia','orcamentos'] });
  let dataOrProviderReached = false;
  for (const currentAccount of [{ permissoes: ['orcamentos'] }, { permissoes: [] }, null, {}]) {
    assert.throws(() => currentACMSession(oldToken, currentAccount), error => error.code === 'FORBIDDEN' && error.status === 403);
  }
  try {
    const refreshed = currentACMSession(oldToken, { permissoes: ['orcamentos'] });
    await handleACM({ action: 'assistant', project: createProject(), prompt: 'teste' }, { session: refreshed, repo: { reserveAI() { dataOrProviderReached = true; } }, fetchImpl() { dataOrProviderReached = true; }, ai: validAI() });
  } catch (error) { assert.equal(error.status, 403); }
  assert.equal(dataOrProviderReached, false);
  assert.equal(currentACMSession(oldToken, { permissoes: ['ferramenta-ia'] }).sub, 'user-a');
  assert.deepEqual(oldToken.perms, ['ferramenta-ia','orcamentos']);
});

test('alias login resolves canonical password status and refuses ambiguous, disabled or failed identity lookup', async () => {
  function identityDB({ direct = [], aliases = [], linked = null, error = null } = {}) {
    const patterns = [];
    return { patterns, from(table) {
      const query = { select() { return query; }, eq() { return query; }, ilike(field,value) { patterns.push([field,value]); return query; }, limit() { return Promise.resolve({ data: table === 'acesso_conta' ? direct : aliases, error }); }, maybeSingle() { return Promise.resolve({ data: linked, error }); } };
      return query;
    } };
  }
  const canonical = { id: 'canonical-account', ativo: true, trocar_senha: true, auth_user_id: null };
  const db = identityDB({ aliases: [{ conta_id: canonical.id, ativo: true }], linked: canonical });
  const found = await readACMIdentity(db, 'alias_login');
  assert.equal(found.trocar_senha, true); assert.equal(found.id, canonical.id);
  assert.ok(db.patterns.every(([,pattern]) => pattern === 'alias\\_login'));
  await rejectCode(readACMIdentity(identityDB({ direct: [{ id: 'a' }], aliases: [{ conta_id: 'b' }] }), 'ambiguous'), 'SESSION_CHECK');
  await rejectCode(readACMIdentity(identityDB({ aliases: [{ conta_id: 'a', ativo: false }] }), 'disabled'), 'SESSION');
  await rejectCode(readACMIdentity(identityDB({ error: { message: 'offline' } }), 'alias'), 'SESSION_CHECK');
  await rejectCode(readACMIdentity(identityDB({ aliases: [{ conta_id: 'missing' }] }), 'alias'), 'SESSION_CHECK');
});

test('owner is derived from verified session; client owner fields, invalid JSON and version are rejected', async () => {
  const calls = [], repo = { save(...args) { calls.push(args); return { version: 1 }; } };
  const project = createProject(); project.ownerId = 'hostile-owner-inside-data';
  const output = await handleACM({ action: 'save', project, expectedVersion: 0 }, { session: session(), repo });
  assert.equal(output.version, 1); assert.equal(calls[0][0], 'user-a');
  await rejectCode(handleACM({ action: 'save', project, expectedVersion: 1, ownerId: 'user-b' }, { session: session(), repo }), 'OWNER');
  await rejectCode(handleACM({ action: 'save', project, expectedVersion: -1 }, { session: session(), repo }), 'VERSION');
  await rejectCode(handleACM({ action: 'save', project: { ...project, schemaVersion: 2 }, expectedVersion: 1 }, { session: session(), repo }), 'SCHEMA');
  await rejectCode(handleACM({ action: 'get', id: '../\u0000other' }, { session: session(), repo }), 'ID');
  await rejectCode(handleACM({ action: 'save', project: { ...project, id: 'project\nwith-control' }, expectedVersion: 0 }, { session: session(), repo }), 'ID');
  assert.equal(calls.length, 1);
});

test('capabilities verifies persistence readiness and never exposes credentials or guesses a model', async () => {
  let checked = 0;
  const body = await handleACM({ action: 'capabilities' }, { session: session(), repo: { health() { checked++; } }, ai: validAI() });
  assert.equal(checked, 1); assert.equal(body.persistence, true); assert.equal(body.assistant.available, true);
  assert.doesNotMatch(JSON.stringify(body), /fictitious-test-key|apiKey/);
  assert.equal(assistantConfiguration({ OPENAI_API_KEY: 'key' }).available, false);
  assert.equal(assistantConfiguration({ ...validAI(), ACM_AI_ENABLED: 'true' }).available, false);
  await assert.rejects(handleACM({ action: 'capabilities' }, { session: session(), repo: { health() { throw new ACMError('DATABASE', 'not ready', 503); } } }), { code: 'DATABASE' });
});

test('repository queries always constrain reads and updates by the server owner', async () => {
  const traces = [], sb = { from(table) {
    const trace = { table, filters: [] }; traces.push(trace);
    const query = { select() { return query; }, update() { return query; }, eq(...filter) { trace.filters.push(filter); return query; }, order() { return query; }, limit() { return Promise.resolve({ data: [], error: null }); }, maybeSingle() { return Promise.resolve({ data: null, error: null }); }, then(resolve) { return Promise.resolve({ error: null }).then(resolve); } };
    return query;
  } };
  const repo = createSupabaseACMRepository(sb);
  await repo.list('owner'); await repo.get('owner','p'); await repo.revisions('owner','p'); await repo.getRevision('owner','p','00000000-0000-4000-8000-000000000001'); await repo.finishAI('owner','r',{ state: 'failed' });
  for (const trace of traces) assert.ok(trace.filters.some(([field, value]) => field === 'dono' && value === 'owner'));
  assert.ok(traces.find(trace => trace.table === 'painel_acm_revisoes').filters.some(([field, value]) => field === 'projeto_id' && value === 'p'));
});

test('AI response whitelist rejects geometry approvals, dangerous keys and invalid values without mutating current project', () => {
  const project = createProject(), before = JSON.stringify(project);
  const valid = validateAIProposal({ summary: 'Frente solicitada', questions: [], edits: [{ path: 'front.width', value: 8000 }] }, project);
  assert.equal(valid.edits[0].value, 8000); assert.equal(JSON.stringify(project), before);
  for (const edit of [{ path: '__proto__.polluted', value: true }, { path: 'fabrication.calibration', value: true }, { path: 'fixing.validated', value: true }, { path: 'front.width', value: -1 }, { path: 'material.thickness', value: 8 }]) assert.throws(() => validateAIProposal({ summary: '', questions: [], edits: [edit] }, project), { code: 'AI_RESPONSE' });
});

test('AI explicitly disabled never calls provider or reserves budget', async () => {
  let called = false;
  await rejectCode(handleACM({ action: 'assistant', project: createProject(), prompt: 'Frente oito metros' }, { session: session(), repo: { reserveAI() { called = true; } }, fetchImpl() { called = true; } }), 'AI_UNAVAILABLE');
  assert.equal(called, false);
});

test('AI reserves bounded cost before provider, sends only allowed context and returns a proposal without save', async () => {
  const calls = [], project = createProject(); project.name = 'Fictional private client';
  const repo = { reserveAI(...args) { calls.push(['reserve', ...args]); return 'reservation-1'; }, finishAI(...args) { calls.push(['finish', ...args]); } };
  const fetchImpl = async (url, options) => {
    calls.push(['provider']); assert.equal(calls[0][0], 'reserve');
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body); assert.equal(body.store, false); assert.equal(body.max_output_tokens, 500); assert.equal(body.model, 'explicit-test-model');
    assert.doesNotMatch(body.input, /Fictional private client|owner|calibration|permissoes/);
    assert.ok(options.signal);
    return { ok: true, async text() { return JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ summary: 'Proposta', edits: [{ path: 'front.width', value: 8000 }], questions: [] }) }] }], usage: { input_tokens: 100, output_tokens: 40 } }); } };
  };
  const response = await handleACM({ action: 'assistant', project, prompt: 'Frente oito metros' }, { session: session(), repo, fetchImpl, ai: validAI() });
  assert.equal(response.proposal.edits[0].value, 8000); assert.equal(project.front.width, 6000);
  assert.equal(response.usage.costEstimateUSD, .00014); assert.ok(calls[0][3] > response.usage.costEstimateUSD);
  assert.equal(calls.at(-1)[3].state, 'complete');
});

test('AI rejects over-budget requests before network and malformed provider results keep reservation', async () => {
  const calls = [], repo = { reserveAI() { calls.push('reserved'); return 'reservation'; }, async finishAI(_owner,_id,usage) { calls.push(usage.state); } };
  let network = 0;
  const request = { action: 'assistant', project: createProject(), prompt: 'Pedido' };
  await rejectCode(handleACM(request, { session: session(), repo, ai: { ...validAI(), maxCost: .000001 }, fetchImpl() { network++; } }), 'AI_COST');
  assert.equal(network, 0); assert.deepEqual(calls, []);
  await rejectCode(handleACM(request, { session: session(), repo, ai: validAI(), fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify({ status: 'incomplete', output: [] }) }) }), 'AI_RESPONSE');
  assert.deepEqual(calls, ['reserved','failed']);
});

test('Edge wrapper requires strict revocation, password check, bounded body and session subject', async () => {
  const source = await readFile(new URL('../docs/acm-studio/backend-preparado/painel-acm/index.ts', import.meta.url), 'utf8');
  assert.match(source, /crachaRevogado\(sb, 'painel', session, true\)/);
  assert.match(source, /readACMIdentity\(sb, session\.sub\)/);
  assert.match(source, /identity\?\.trocar_senha === true/);
  assert.match(source, /session\.exp <= Date\.now\(\) \/ 1000/);
  assert.match(source, /total > ACM_LIMITS.bodyBytes/);
  assert.match(source, /select\('usuario,permissoes'\)/);
  assert.match(source, /currentACMSession\(session, currentAccount\)/);
  assert.doesNotMatch(source, /req\.headers\.get\(['"]x-token|console\.log|console\.error/);
});

test('prepared ACM endpoint stays out of deployment discovery and its local dependencies still bundle', async () => {
  const deployRoot = new URL('../supabase/functions/', import.meta.url), discovered = [];
  for (const entry of await readdir(deployRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === '_shared') continue;
    try { await access(new URL(`${entry.name}/index.ts`, deployRoot)); discovered.push(entry.name); } catch { /* No deployment entrypoint. */ }
  }
  assert.ok(discovered.includes('painel-comercial'));
  assert.ok(!discovered.includes('painel-acm'), 'The prepared endpoint must not be published automatically.');
  const prepared = new URL('../docs/acm-studio/backend-preparado/painel-acm/index.ts', import.meta.url);
  const source = (await readFile(prepared, 'utf8')).replace(/^import.*createClient.*\n/m, 'const createClient = globalThis.createClient;\n');
  const require = createRequire(import.meta.url), { buildSync } = createRequire(require.resolve('vite'))('esbuild');
  const bundle = buildSync({ stdin: { contents: source, loader: 'ts', resolveDir: fileURLToPath(new URL('./', prepared)) }, bundle: true, write: false, format: 'esm', platform: 'neutral' });
  assert.ok(bundle.outputFiles[0].text.includes('Deno.serve'));
});

async function database() {
  const db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const sql = await readFile(new URL('../docs/acm-studio/schema.sql', import.meta.url), 'utf8');
  await db.exec(sql); await db.exec(sql);
  return db;
}
const save = async (db, owner, project, version, snapshot = false) => (await db.query('select public.painel_acm_salvar($1,$2::jsonb,$3,$4) as saved', [owner, JSON.stringify(project), version, snapshot])).rows[0].saved;

test('PostgreSQL CAS, snapshot and event are atomic; concurrent expected version has one winner', async () => {
  const db = await database();
  try {
    await db.exec('set role service_role');
    const project = createProject(), first = await save(db,'a',project,0,true);
    assert.equal(first.version, 1); assert.equal(first.snapshot.revision, 1);
    const race = await Promise.allSettled([save(db,'a',{ ...project, revision: 2, name: 'Writer A' },1,true), save(db,'a',{ ...project, revision: 2, name: 'Writer B' },1,true)]);
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 1);
    assert.match(race.find(r => r.status === 'rejected').reason.message, /ACM_CONFLICT/);
    const rows = await db.query("select versao,projeto from painel_acm_projetos where dono='a'");
    assert.equal(Number(rows.rows[0].versao), 2); assert.equal(rows.rows[0].projeto.name, 'Writer A');
    assert.equal((await db.query("select count(*)::int as n from painel_acm_revisoes where dono='a'")).rows[0].n, 2);
    assert.equal((await db.query("select count(*)::int as n from painel_acm_eventos where dono='a'")).rows[0].n, 2);
    await assert.rejects(save(db,'a',{ ...project, name: 'Overwrite frozen revision' },2,true), /ACM_REVISION_CONFLICT/);
    assert.equal((await db.query("select count(*)::int as n from painel_acm_eventos where dono='a'")).rows[0].n, 2);
  } finally { await db.close(); }
});

test('PostgreSQL same project id belongs independently to each owner; revisions remain immutable', async () => {
  const db = await database();
  try {
    await db.exec('set role service_role'); const project = createProject();
    await save(db,'a',project,0,true); await save(db,'b',{ ...project, name: 'Owner B' },0,true);
    assert.equal((await db.query("select projeto->>'name' as name from painel_acm_projetos where dono='a' and id=$1",[project.id])).rows[0].name, project.name);
    assert.equal((await db.query("select projeto->>'name' as name from painel_acm_projetos where dono='b' and id=$1",[project.id])).rows[0].name, 'Owner B');
    const duplicate = await save(db,'a',project,1,true); assert.equal(duplicate.version, 2);
    assert.equal((await db.query("select count(*)::int as n from painel_acm_revisoes where dono='a'")).rows[0].n, 1);
    await assert.rejects(db.exec("update painel_acm_revisoes set projeto='{}'"), error => error.code === '42501');
    await assert.rejects(db.exec('delete from painel_acm_revisoes'), error => error.code === '42501');
    await assert.rejects(db.exec('delete from painel_acm_eventos'), error => error.code === '42501');
  } finally { await db.close(); }
});

test('PostgreSQL tables and RPCs deny anonymous/authenticated roles and enforce RLS', async () => {
  const db = await database();
  try {
    const states = await db.query("select relname,relrowsecurity from pg_class where relname in ('painel_acm_projetos','painel_acm_revisoes','painel_acm_eventos','painel_acm_ai_uso')");
    assert.equal(states.rows.length, 4); assert.ok(states.rows.every(row => row.relrowsecurity));
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      for (const table of ['painel_acm_projetos','painel_acm_revisoes','painel_acm_eventos','painel_acm_ai_uso']) await assert.rejects(db.exec(`select * from ${table}`), error => error.code === '42501');
      await assert.rejects(save(db,'fake',createProject(),0), error => error.code === '42501');
      await assert.rejects(db.query("select painel_acm_ai_reservar('fake','fake',0.01,1)"), error => error.code === '42501');
      await db.exec('reset role');
    }
  } finally { await db.close(); }
});

test('PostgreSQL AI reserves budget atomically, rejects burst/day cost and keeps owner separation', async () => {
  const db = await database();
  try {
    await db.exec('set role service_role');
    const reserve = owner => db.query('select painel_acm_ai_reservar($1,$2,$3,$4)',[owner,'test-model',.01,.1]);
    const race = await Promise.allSettled([reserve('a'),reserve('a'),reserve('a'),reserve('a')]);
    assert.equal(race.filter(r => r.status === 'fulfilled').length, 3); assert.match(race.find(r => r.status === 'rejected').reason.message, /ACM_AI_LIMIT/);
    await reserve('b');
    await assert.rejects(db.query("select painel_acm_ai_reservar('cost','test-model',0.02,0.01)"), /ACM_AI_LIMIT/);
    assert.equal((await db.query("select count(*)::int as n from painel_acm_ai_uso where dono='a'")).rows[0].n, 3);
    assert.equal((await db.query("select count(*)::int as n from painel_acm_ai_uso where dono='cost'")).rows[0].n, 0);
  } finally { await db.close(); }
});
