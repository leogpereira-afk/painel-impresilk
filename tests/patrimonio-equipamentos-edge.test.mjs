import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';

// Handler real; somente autenticação e banco são substituídos por dados fictícios.
const fonte = readFileSync(new URL('../supabase/functions/painel-ativos/index.ts', import.meta.url), 'utf8').replace(/^import .*;\s*$/gm, '');
const codigo = transformSync(fonte, { loader: 'ts', format: 'esm', target: 'es2022' }).code;
function ambiente({ sessao = { sub: 'pessoa', perms: ['patrimonio'] }, linhas = [], revogada = false, erroBanco = false } = {}) {
  let handler;
  const consultas = [], gravacoes = [];
  const sb = {
    from(tabela) {
      assert.equal(tabela, 'painel_registros');
      const consulta = { filtros: [], inicio: 0, fim: Infinity };
      consultas.push(consulta);
      const resultado = () => ({ error: erroBanco ? { message: 'Falha simulada' } : null, data: erroBanco ? null : linhas.filter(linha => consulta.filtros.every(([campo, valor, operador]) => {
        const salvo = campo.startsWith('registro->>') ? linha.registro?.[campo.slice(11)] : linha[campo];
        return operador === 'in' ? valor.includes(salvo) : salvo === valor;
      })).sort((a, b) => a.id.localeCompare(b.id)).slice(consulta.inicio, consulta.fim + 1) });
      const q = {
        select(campos) { consulta.campos = campos;return q; },
        eq(campo, valor) { consulta.filtros.push([campo, valor, 'eq']);return q; },
        in(campo, valor) { consulta.filtros.push([campo, valor, 'in']);return q; },
        order() { return q; }, range(inicio, fim) { Object.assign(consulta, { inicio, fim });return q; },
        async maybeSingle() { const r = resultado();return { ...r, data: r.data?.[0] ?? null }; },
        then(a, b) { return Promise.resolve(resultado()).then(a, b); },
      };
      return q;
    },
    rpc(nome, args) { gravacoes.push({ nome, args });throw new Error('Consulta não pode gravar'); },
    storage: { from() { throw new Error('Consulta não pode acessar anexos'); } },
  };
  vm.runInNewContext(codigo, {
    Deno: { env: { get: () => 'teste' }, serve: fn => { handler = fn; } },
    createClient: () => sb, verificarJwt: async () => sessao, crachaRevogado: async () => revogada,
    Response, Request, console: { error() {} },
  });
  return {
    consultas, gravacoes,
    async chamar(corpo = { action: 'listarPatrimonio' }) {
      const resp = await handler(new Request('https://teste.invalid', { method: 'POST', headers: { authorization: 'Bearer teste', 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) }));
      return { status: resp.status, body: await resp.json() };
    },
  };
}
const registro = (id, tipo = 'veiculo', extra = {}, colecao = 'ativo') => ({ id, colecao, registro: { id, tipo, nome: `Item ${id}`, ...extra } });

test('Patrimônio consulta carros e máquinas da base de ativos com projeção fechada e ID canônico', async () => {
  const a = ambiente({ linhas: [
    registro('v1', 'veiculo', { id: 'id-interno-incorreto', nome: 'Carro da entrega', responsavel: 'Operação', bemId: 'bem1', especificacao: { placa: 'ABC1D23', marcaModelo: 'Van exemplo', ano: '2024', renavam: 'RENAVAM-PRIVADO', chassi: 'CHASSI-PRIVADO', motorista: 'MOTORISTA-PRIVADO', segredo: 'SEGREDO-INTERNO' }, valor: 80000, valorSegurado: 95000, arquivoNome: 'CRLV-PRIVADO.pdf', temArquivo: true, observacao: 'OBSERVACAO-PRIVADA', miniatura: 'data:privado', atualizadoPor: 'Pessoa do cadastro', atualizadoEm: '2026-10-05T15:00:00Z' }),
    registro('m1', 'maquina', { especificacao: { fabricante: 'Fabricante', modelo: 'M10', numeroSerie: 'SN-001', ano: '2025', setor: 'Impressão', segredo: 'SEGREDO-INTERNO' } }),
    ...['documento', 'seguro', 'marketing', 'licitacao', 'predial', 'inventado'].map(tipo => registro(tipo, tipo)),
    registro('retirado', 'veiculo', {}, 'ativo_lixeira'),
  ] });
  const r = await a.chamar();
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.itens.map(item => item.id), ['m1', 'v1']);
  const carro = r.body.itens[1];
  assert.deepEqual(carro, { id: 'v1', tipo: 'veiculo', nome: 'Carro da entrega', responsavel: 'Operação', bemId: 'bem1', especificacao: { placa: 'ABC1D23', marcaModelo: 'Van exemplo', ano: '2024' }, atualizadoPor: 'Pessoa do cadastro', atualizadoEm: '2026-10-05T15:00:00Z' });
  assert.deepEqual(r.body.itens[0].especificacao, { fabricante: 'Fabricante', modelo: 'M10', numeroSerie: 'SN-001', ano: '2025', setor: 'Impressão' });
  assert.doesNotMatch(JSON.stringify(r.body), /PRIVAD|SEGREDO|80000|95000|temArquivo|miniatura|valorSegurado/);
  assert.equal(a.gravacoes.length, 0);
});

test('somente Patrimônio, direção e acesso total recebem a consulta dedicada', async () => {
  for (const sessao of [{ perms: ['patrimonio'] }, { master: true }, { perms: ['*'] }]) {
    const a = ambiente({ sessao, linhas: [registro('v1')] });
    assert.equal((await a.chamar()).status, 200);
  }
  for (const sessao of [null, { perms: ['orcamentos'] }, { perms: ['manutencoes'] }, { perms: ['documentos'] }, { perms: [] }]) {
    const a = ambiente({ sessao, linhas: [registro('v1')] });
    assert.equal((await a.chamar()).status, sessao ? 403 : 401);
    assert.equal(a.consultas.length, 0, 'recusa acontece antes de consultar ativos');
  }
  const revogada = ambiente({ revogada: true });
  assert.equal((await revogada.chamar()).status, 401);
  assert.equal(revogada.consultas.length, 0);
});

test('permissão de Patrimônio não abre listagem completa, anexos nem alterações dos ativos', async () => {
  const a = ambiente({ linhas: [registro('v1'), registro('documento1', 'documento'), registro('retirado', 'veiculo', {}, 'ativo_lixeira')] });
  assert.deepEqual((await a.chamar({ action: 'listar' })).body.itens, []);
  assert.deepEqual((await a.chamar({ action: 'lixeira' })).body.itens, []);
  for (const tipo of ['veiculo', 'maquina', 'documento', 'seguro', 'predial']) {
    assert.equal((await a.chamar({ action: 'salvar', item: { tipo, nome: 'Não gravar' } })).status, 403);
  }
  for (const action of ['remover', 'guardarArquivo', 'lerArquivo']) {
    assert.equal((await a.chamar({ action, id: 'v1', base64: 'AA==', mime: 'application/pdf' })).status, 403, action);
  }
  assert.equal((await a.chamar({ action: 'restaurar', id: 'retirado' })).status, 403);
  assert.equal(a.gravacoes.length, 0);
});

test('consulta pagina todos os equipamentos e não perde o registro após o milésimo', async () => {
  const linhas = Array.from({ length: 1001 }, (_, i) => registro(`v${String(i).padStart(4, '0')}`));
  const a = ambiente({ linhas });
  const r = await a.chamar();
  assert.equal(r.status, 200);assert.equal(r.body.itens.length, 1001);
  assert.equal(new Set(r.body.itens.map(item => item.id)).size, 1001);
  assert.deepEqual(a.consultas.map(q => q.inicio), [0, 1000]);
});

test('falha no banco não se apresenta como lista vazia e campos malformados não vazam objetos', async () => {
  const falha = await ambiente({ erroBanco: true }).chamar();
  assert.equal(falha.status, 500);assert.notEqual(falha.body.ok, true);
  const r = await ambiente({ linhas: [registro('v1', 'veiculo', { nome: { segredo: 1 }, especificacao: ['privado'], responsavel: { telefone: 'privado' } })] }).chamar();
  assert.equal(r.status, 200);
  assert.equal(r.body.itens[0].nome, '');assert.equal(r.body.itens[0].responsavel, '');
  assert.deepEqual(r.body.itens[0].especificacao, { placa: '', marcaModelo: '', ano: '' });
});
