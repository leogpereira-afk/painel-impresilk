import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';

// Handler real: só autenticação e transporte ao banco usam dados sintéticos.
const fonte = readFileSync(new URL('../supabase/functions/painel-ativos/index.ts', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
const codigo = transformSync(fonte, { loader: 'ts', format: 'esm', target: 'es2022' }).code;
const ID = '671f0a1d-0fbe-4b90-9ad8-3cbd81e8a7e0';
const sessaoPadrao = { sub: 'ana', nome: 'Ana Exemplo', perms: ['patrimonio'] };
const novo = (extra = {}) => ({ cadastroId: ID, nome: 'Ar da recepção', categoria: 'Ar condicionado', identificacao: 'AC-01', responsavel: 'Manutenção', observacao: 'Limpar filtros', especificacao: { local: 'Recepção', marcaModelo: 'Marca 12.000 BTUs', quantidade: '1', instalacao: '2024-02-29' }, ...extra });
function ambiente({ sessao = sessaoPadrao, revogada = false, linhas = [], erroLeitura = false } = {}) {
  let handler, erroRpc, antesGravar;
  const registros = structuredClone(linhas), consultas = [], gravacoes = [];
  const sb = {
    from(tabela) {
      assert.equal(tabela, 'painel_registros');
      const filtros = []; let inicio = 0, fim = Infinity;
      consultas.push(filtros);
      function resultado() {
        const lista = registros.filter(r => filtros.every(([k, v, op]) => {
          const valor = k.startsWith('registro->>') ? r.registro[k.slice(11)] : r[k];
          return op === 'in' ? v.includes(valor) : valor === v;
        })).sort((a, b) => a.id.localeCompare(b.id)).slice(inicio, fim + 1);
        return { data: erroLeitura ? null : structuredClone(lista), error: erroLeitura ? { message: 'falha simulada' } : null };
      }
      const q = { select() { return q; }, eq(k, v) { filtros.push([k, v]); return q; }, in(k, v) { filtros.push([k, v, 'in']); return q; }, order() { return q; }, range(a, b) { inicio = a; fim = b; return q; }, async maybeSingle() { const r = resultado(); return { ...r, data: r.data?.[0] || null }; }, then(a, b) { return Promise.resolve(resultado()).then(a, b); } };
      return q;
    },
    async rpc(nome, p) {
      gravacoes.push({ nome, args: structuredClone(p) });
      assert.equal(nome, 'painel_registro_gravar'); assert.equal(p.p_colecao, 'ativo');
      if (antesGravar) await antesGravar();
      if (erroRpc) return { error: erroRpc };
      const indice = registros.findIndex(r => r.colecao === p.p_colecao && r.id === p.p_id);
      if (JSON.stringify(registros[indice]?.registro || null) !== JSON.stringify(p.p_anterior)) return { error: { code: '40001', message: 'concorrência' } };
      const registro = structuredClone(p.p_registro), linha = { colecao: p.p_colecao, id: p.p_id, registro };
      if (indice >= 0) registros[indice] = linha; else registros.push(linha);
      return { data: structuredClone(registro), error: null };
    },
    storage: { from() { throw new Error('Estrutura não pode acessar anexos'); } },
  };
  vm.runInNewContext(codigo, { Deno: { env: { get: () => 'teste' }, serve: fn => { handler = fn; } }, createClient: () => sb, verificarJwt: async () => sessao, crachaRevogado: async () => revogada, Request, Response, console: { error() {} } });
  return {
    registros, consultas, gravacoes, antesGravar: fn => { antesGravar = fn; }, falharRpc: erro => { erroRpc = erro; },
    async chamar(item = novo(), versao, action = 'salvarEstrutura') {
      const resp = await handler(new Request('https://teste.invalid', { method: 'POST', headers: { authorization: 'Bearer teste', 'Content-Type': 'application/json' }, body: JSON.stringify({ action, item, versao }) }));
      return { status: resp.status, body: await resp.json() };
    },
  };
}
const linha = (id, registro, colecao = 'ativo') => ({ id, colecao, registro: { id, tipo: 'predial', ...registro } });

test('cadastro cria somente ativo predial com autoria do servidor e retorna a projeção segura', async () => {
  const a = ambiente();
  const r = await a.chamar(novo({ valor: 9000, valorSegurado: 9900, arquivoNome: 'sigiloso.pdf', temArquivo: true, bemId: 'forjado', atualizadoPor: 'Falso', atualizadoEm: '2000-01-01', criadoEm: '2000-01-01', especificacao: { ...novo().especificacao, segredo: 'segredo', quantidade: 2 } }));
  assert.equal(r.status, 200); assert.equal(a.registros.length, 1);
  const salvo = a.registros[0].registro;
  assert.equal(salvo.tipo, 'predial'); assert.equal(salvo.id, ID); assert.equal(salvo.atualizadoPor, 'Ana Exemplo');
  assert.ok(Date.parse(salvo.atualizadoEm) > Date.parse('2000-01-01')); assert.equal(salvo.criadoEm, salvo.atualizadoEm);
  assert.equal(salvo.especificacao.quantidade, '2');
  assert.doesNotMatch(JSON.stringify(salvo), /sigiloso|segredo|forjado|9000|9900|Falso|cadastroId/);
  assert.deepEqual(Object.keys(r.body.item).sort(), ['id', 'tipo', 'nome', 'categoria', 'identificacao', 'responsavel', 'observacao', 'especificacao', 'bemId', 'atualizadoEm', 'atualizadoPor'].sort());
  assert.deepEqual(a.gravacoes.map(x => x.args.p_colecao), ['ativo']);
  const listada = await a.chamar(undefined, undefined, 'listarPatrimonio');
  assert.deepEqual(listada.body.itens, [r.body.item]);
});

test('edição preserva anexos, finanças, vínculos e campos privados fora da ficha', async () => {
  const base = { ...novo(), cadastroId: undefined, id: ID, tipo: 'predial', bemId: 'bem1', valor: 9000, valorSegurado: 9900, arquivoNome: 'sigiloso.pdf', temArquivo: true, medidorAtual: 20, segredo: { x: 1 }, criadoEm: '2020-01-01', atualizadoEm: '2026-10-05T15:00:00.000Z', especificacao: { ...novo().especificacao, privado: 'preservar' } };
  delete base.cadastroId;
  const a = ambiente({ linhas: [linha(ID, base)] });
  const r = await a.chamar({ id: ID, nome: 'Ar novo', observacao: '', especificacao: { local: 'Sala 2' }, valor: 0, temArquivo: false, bemId: 'falso', segredo: null }, base.atualizadoEm);
  assert.equal(r.status, 200);
  const salvo = a.registros[0].registro;
  for (const campo of ['bemId', 'valor', 'valorSegurado', 'arquivoNome', 'temArquivo', 'medidorAtual', 'segredo', 'criadoEm']) assert.deepEqual(salvo[campo], base[campo], campo);
  assert.equal(salvo.especificacao.privado, 'preservar'); assert.equal(salvo.especificacao.marcaModelo, base.especificacao.marcaModelo);
  assert.equal(salvo.especificacao.local, 'Sala 2'); assert.equal(salvo.observacao, ''); assert.equal(salvo.nome, 'Ar novo');
  assert.doesNotMatch(JSON.stringify(r.body.item), /sigiloso|preservar|9000|9900|privado|medidorAtual/);
  assert.deepEqual(a.gravacoes[0].args.p_anterior, JSON.parse(JSON.stringify(base)));
});

test('somente Patrimônio, master e acesso total gravam Estrutura', async () => {
  for (const sessao of [sessaoPadrao, { master: true }, { perms: ['*'] }]) assert.equal((await ambiente({ sessao }).chamar()).status, 200);
  for (const sessao of [null, { perms: [] }, { perms: ['manutencoes'] }, { perms: ['documentos'] }, { perms: ['orcamentos'] }]) {
    const a = ambiente({ sessao }); assert.equal((await a.chamar()).status, sessao ? 403 : 401);
    assert.equal(a.consultas.length, 0); assert.equal(a.gravacoes.length, 0);
  }
  const a = ambiente({ revogada: true }); assert.equal((await a.chamar()).status, 401); assert.equal(a.consultas.length, 0);
});

test('ação dedicada não altera outro tipo nem permite trocar ou misturar identificadores', async () => {
  for (const tipo of ['veiculo', 'maquina', 'documento', 'seguro', 'marketing', 'licitacao']) {
    const a = ambiente({ linhas: [linha(ID, { tipo, nome: 'Privado' })] });
    assert.equal((await a.chamar({ ...novo(), cadastroId: undefined, id: ID })).status, 403);
    assert.equal((await a.chamar(novo())).status, 403); assert.equal(a.gravacoes.length, 0);
  }
  for (const item of [novo({ tipo: 'maquina' }), novo({ id: 'outro' }), novo({ cadastroId: 'sem-uuid' }), novo({ cadastroId: null }), { id: '' }, { id: '../outro' }, null, []]) {
    const a = ambiente(); assert.equal((await a.chamar(item)).status, 400); assert.equal(a.gravacoes.length, 0);
  }
});

test('edição exige versão atual e não recria registros retirados', async () => {
  const a = ambiente(); const criado = await a.chamar(); const versao = criado.body.item.atualizadoEm;
  for (const antiga of [undefined, null, '2000-01-01']) assert.equal((await a.chamar({ id: ID, nome: 'Não gravar' }, antiga)).status, 409);
  const editado = await a.chamar({ id: ID, nome: 'Nome atual' }, versao);
  assert.equal(editado.status, 200); assert.notEqual(editado.body.item.atualizadoEm, versao);
  assert.equal((await a.chamar({ id: ID, nome: 'Cópia antiga' }, versao)).status, 409);
  assert.equal(a.registros[0].registro.nome, 'Nome atual');
  assert.equal((await ambiente().chamar({ id: 'predial-legado' }, '')).status, 409);
  const lixeira = ambiente({ linhas: [linha(ID, novo(), 'ativo_lixeira')] });
  assert.equal((await lixeira.chamar()).status, 409); assert.equal(lixeira.gravacoes.length, 0);
});

test('cadastro predial legado sem atualizadoEm aceita versão vazia uma vez e passa a exigir a versão confirmada', async () => {
  const id = 'predial-legado', base = { ...novo(), valor: 1500, arquivoNome: 'anexo-legado.pdf', temArquivo: true };
  delete base.cadastroId;
  const a = ambiente({ linhas: [linha(id, base)] });
  const lista = await a.chamar(undefined, undefined, 'listarPatrimonio');
  assert.equal(lista.body.itens[0].atualizadoEm, '');
  const r = await a.chamar({ id, nome: 'Ar legado atualizado' }, lista.body.itens[0].atualizadoEm);
  assert.equal(r.status, 200); assert.equal(r.body.item.id, id); assert.equal(r.body.item.nome, 'Ar legado atualizado');
  assert.ok(Number.isFinite(Date.parse(r.body.item.atualizadoEm))); assert.equal(r.body.item.atualizadoPor, 'Ana Exemplo');
  assert.equal(a.registros[0].registro.valor, 1500); assert.equal(a.registros[0].registro.arquivoNome, 'anexo-legado.pdf');
  assert.equal(a.gravacoes[0].args.p_anterior.atualizadoEm, undefined);
  const repetido = await a.chamar({ id, nome: 'Cópia antiga não deve substituir' }, '');
  assert.equal(repetido.status, 409); assert.equal(a.gravacoes.length, 1);
  assert.equal(a.registros[0].registro.nome, 'Ar legado atualizado');
});

test('cadastroId é idempotente, inclusive com resposta perdida e conteúdo diferente no reenvio', async () => {
  const a = ambiente(); const inicial = await a.chamar();
  const repetido = await a.chamar(novo({ nome: 'Não sobrescrever', especificacao: { local: 'Outro' } }));
  assert.equal(repetido.status, 200); assert.deepEqual(repetido.body.item, inicial.body.item);
  assert.equal(a.registros.length, 1); assert.equal(a.gravacoes.length, 1);
});

test('dois cadastros simultâneos com a mesma identidade retornam o primeiro confirmado', async () => {
  const a = ambiente(); let chegadas = 0, liberar;
  const prontas = new Promise(resolve => { liberar = resolve; });
  a.antesGravar(async () => { if (++chegadas === 2) liberar(); await prontas; });
  const resultados = await Promise.all([a.chamar(), a.chamar(novo({ nome: 'Segunda cópia' }))]);
  assert.deepEqual(resultados.map(r => r.status), [200, 200]); assert.equal(a.registros.length, 1);
  assert.deepEqual(resultados[0].body.item, resultados[1].body.item); assert.equal(a.registros[0].registro.nome, 'Ar da recepção');
});

test('duas edições simultâneas passam pelo CAS e apenas uma é confirmada', async () => {
  const a = ambiente(), criado = await a.chamar(); let chegadas = 0, liberar;
  const prontas = new Promise(resolve => { liberar = resolve; });
  a.antesGravar(async () => { if (++chegadas === 2) liberar(); await prontas; });
  const resultados = await Promise.all(['Sala A', 'Sala B'].map(local => a.chamar({ id: ID, especificacao: { local } }, criado.body.item.atualizadoEm)));
  assert.deepEqual(resultados.map(r => r.status).sort(), [200, 409]);
  assert.equal(a.registros[0].registro.especificacao.local, 'Sala A');
  assert.deepEqual(a.gravacoes[1].args.p_anterior, a.gravacoes[2].args.p_anterior);
});

test('campos obrigatórios, limites, quantidades e datas reais são validados antes da gravação', async () => {
  const invalidos = [
    { nome: '' }, { nome: ' '.repeat(2) }, { nome: 'n'.repeat(181) }, { nome: {} },
    { categoria: '' }, { categoria: 'c'.repeat(121) }, { identificacao: 'i'.repeat(121) },
    { responsavel: 'r'.repeat(181) }, { observacao: 'o'.repeat(2001) },
    ...[null, [], 'texto'].map(especificacao => ({ especificacao })),
    ...[{ local: '' }, { local: 'l'.repeat(121) }, { marcaModelo: 'm'.repeat(121) },
      ...[undefined, null, '', 0, -1, 1.5, 1000001, true, {}, '1.5', '1e2'].map(quantidade => ({ quantidade })),
      ...['2025-02-29', '2024-02-30', '2024-13-01', '0000-01-01', '01/01/2026', '2026-1-01'].map(instalacao => ({ instalacao }))].map(patch => ({ especificacao: { ...novo().especificacao, ...patch } })),
  ];
  for (const campos of invalidos) {
    const a = ambiente(); const r = await a.chamar(novo(campos));
    assert.equal(r.status, 422, JSON.stringify(campos)); assert.equal(a.gravacoes.length, 0);
  }
  for (const quantidade of [1, '1', '1000000']) {
    const a = ambiente(); assert.equal((await a.chamar(novo({ especificacao: { ...novo().especificacao, quantidade, instalacao: '' } }))).status, 200);
  }
});

test('falha de leitura ou gravação não confirma salvamento nem usa operação alternativa', async () => {
  const leitura = ambiente({ erroLeitura: true }); assert.equal((await leitura.chamar()).status, 500); assert.equal(leitura.gravacoes.length, 0);
  for (const erro of [{ code: '40001', message: 'retirado' }, { code: 'XX000', message: 'banco indisponível' }]) {
    const a = ambiente(); a.falharRpc(erro); const r = await a.chamar();
    assert.equal(r.status, erro.code === '40001' ? 409 : 500); assert.notEqual(r.body.ok, true); assert.equal(a.registros.length, 0); assert.equal(a.gravacoes.length, 1);
  }
});
