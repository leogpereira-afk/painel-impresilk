/* O ID DA CONTA DIFERENTE DA FICHA DO RH (auditoria de 12/10/2026, P1).
 *
 * O admin do RH trocou o ID gravado numa ficha e a conta da Central
 * (acesso_conta.id_pessoa) ficou com o antigo, sem nada na tela mostrar. Agora
 * `listar` marca a conta (idFicha) e "Atualizar pela ficha" refaz a amarracao
 * pela ficha LIGADA, com a regua de _shared/id-pessoa-acesso.mjs: ID que e de
 * outra pessoa nao e copiado.
 *
 * A function roda inteira com o banco falso (tests/apoio-senha.mjs). O falso
 * nao recorta colunas: as linhas de `registros` ja vem com os apelidos que o
 * PostgREST devolveria (idPessoa, cpf, nome, situacao). Dados ficticios: CPFs
 * e IDs inventados, nenhum de pessoa real. Casos ruins primeiro.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bancoFalso, carregar, cracha } from "./apoio-senha.mjs";
import { idDaContaPelaFicha, cadastroDaLeitura, MOTIVO_CONTA_NAO_ATUALIZA } from "../supabase/functions/_shared/id-pessoa-acesso.mjs";

const ID = "c0000000-0000-4000-8000-0000000000d1";
const DIRECAO = cracha({ sub: "leonardo", nome: "Direção", master: true, perms: ["*"], vend: "" });
const CURINGA = cracha({ sub: "curinga", nome: "Acesso total", master: false, perms: ["*"], vend: "" });

// A ficha da pessoa: o CPF foi corrigido e o admin do RH gravou o ID novo.
const ficha = (id, { idPessoa = null, cpf = "", nome = `Pessoa ${id}`, colecao = "colaboradores" } = {}) => ({
  id, colecao, apagado: false, nome, situacao: "ativo", idPessoa, cpf,
  registro: { nome, statusId: "ativo", cpf, ...(idPessoa === null ? {} : { idPessoa }) },
});

function estado({ idConta = "111222", fichaB = ficha("ficha-b", { idPessoa: "222333", cpf: "22233344455", nome: "Pessoa Ficticia" }), outros = [], contas = [] } = {}) {
  return {
    acesso_conta: [
      { id: ID, usuario: "ficticia", nome: "Pessoa Fictícia", tipo: "pessoa", colaborador: "Pessoa Ficticia",
        colaborador_id: "ficha-b", id_pessoa: idConta, ativo: true, trocar_senha: false },
      { id: "c-dir", usuario: "leonardo", nome: "Direção", tipo: "pessoa", ativo: true, id_pessoa: null },
      ...contas,
    ],
    registros: [fichaB, ...outros],
  };
}

async function montar(est = estado()) {
  const banco = bancoFalso({ estado: est });
  // A contagem de orcamentos por vendedor nao e assunto deste teste.
  const rpc = banco.cliente.rpc;
  banco.cliente.rpc = (nome, args) => (nome === "painel_vendedores" ? Promise.resolve({ data: [], error: null }) : rpc(nome, args));
  const f = await carregar("painel-acesso", banco);
  return { banco, f };
}
const listar = (f, token = DIRECAO) => f.chamar(token, { action: "listar" });
const atualizar = (f, usuario = "ficticia", token = DIRECAO) => f.chamar(token, { action: "atualizarIdPelaFicha", usuario });
const gravacoesDaConta = (banco) => banco.ops.filter((o) => o.tipo === "from" && o.tabela === "acesso_conta" && o.acao !== "select");
const daConta = (banco) => banco.tabelas.acesso_conta.find((c) => c.id === ID);

// ------------------------------------------------------------ os casos ruins

test("P1: ID trocado na ficha do RH, a conta com o antigo aparece marcada (sem o ID novo nem o CPF na resposta)", async () => {
  const { f } = await montar();
  const r = await listar(f);
  assert.equal(r.status, 200, r.texto);
  const c = r.body.contas.find((x) => x.usuario === "ficticia");
  assert.deepEqual(c.idFicha, { diferente: true, podeAtualizar: true });
  assert.doesNotMatch(r.texto, /222333/, "o ID que a ficha da nao desce para a tela");
  assert.doesNotMatch(r.texto, /22233344455/, "o CPF nao desce para a tela");
  // A conta da direcao nao tem ficha ligada: nada a comparar.
  assert.equal(r.body.contas.find((x) => x.usuario === "leonardo").idFicha, null);
});

test("ID gravado que ja e de OUTRA pessoa no RH: marcada, mas o botao nao copia (409, nada gravado)", async () => {
  // A ficha diz 222333, e outra ficha viva (CPF diferente) tem esse ID pelo CPF.
  const outra = ficha("ficha-c", { cpf: "22233399900", nome: "Outra Pessoa" });
  const fichaB = ficha("ficha-b", { idPessoa: "222333", cpf: "55566677788", nome: "Pessoa Ficticia" });
  // A conta ja tem o ID do CPF (o que a regua da): so o gravado e que difere.
  const { banco, f } = await montar(estado({ idConta: "555666", fichaB, outros: [outra] }));
  const l = await listar(f);
  assert.deepEqual(l.body.contas.find((x) => x.usuario === "ficticia").idFicha,
    { diferente: true, podeAtualizar: false, motivo: "id-de-outra-pessoa" });

  const r = await atualizar(f);
  assert.equal(r.status, 409);
  assert.match(r.body.erro, /já é de outra pessoa/);
  assert.equal(daConta(banco).id_pessoa, "555666");
  assert.equal(gravacoesDaConta(banco).length, 0);
});

test("conta com um ID qualquer e gravado de outra pessoa: atualiza para o do CPF, NUNCA para o da outra pessoa", async () => {
  const outra = ficha("ficha-c", { cpf: "22233399900", nome: "Outra Pessoa" });
  const fichaB = ficha("ficha-b", { idPessoa: "222333", cpf: "55566677788", nome: "Pessoa Ficticia" });
  const { banco, f } = await montar(estado({ idConta: "111222", fichaB, outros: [outra] }));
  const r = await atualizar(f);
  assert.equal(r.status, 200, r.texto);
  assert.equal(daConta(banco).id_pessoa, "555666");
});

test("o ID da ficha ja e de outra conta da Central: nao atualiza (o indice unico recusaria)", async () => {
  const { banco, f } = await montar(estado({
    contas: [{ id: "c-outra", usuario: "outra", nome: "Outra", tipo: "pessoa", ativo: true, id_pessoa: "222333" }],
  }));
  const l = await listar(f);
  assert.deepEqual(l.body.contas.find((x) => x.usuario === "ficticia").idFicha,
    { diferente: true, podeAtualizar: false, motivo: "id-em-outra-conta" });
  const r = await atualizar(f);
  assert.equal(r.status, 409);
  assert.equal(daConta(banco).id_pessoa, "111222");
  assert.equal(gravacoesDaConta(banco).length, 0);
});

test("quem nao e a direcao (acesso total) nao atualiza: 403 e zero operacoes", async () => {
  const { banco, f } = await montar();
  const r = await atualizar(f, "ficticia", CURINGA);
  assert.equal(r.status, 403);
  assert.equal(banco.ops.length, 0);
});

test("conta sem ficha ligada, ou ficha apagada: nada a atualizar", async () => {
  let { banco, f } = await montar(estado({ contas: [{ id: "c-sem", usuario: "semficha", nome: "Sem", tipo: "funcao", ativo: true, id_pessoa: null }] }));
  let r = await atualizar(f, "semficha");
  assert.equal(r.status, 409);
  assert.equal(gravacoesDaConta(banco).length, 0);

  ({ banco, f } = await montar(estado({ fichaB: { ...ficha("ficha-b", { idPessoa: "222333", cpf: "22233344455" }), apagado: true } })));
  r = await atualizar(f);
  assert.equal(r.status, 404);
  assert.equal(daConta(banco).id_pessoa, "111222");
});

// ------------------------------------------------------------ o conserto

test("Atualizar pela ficha: a conta passa a ter o ID gravado na ficha, e so ele muda", async () => {
  const { banco, f } = await montar();
  const antes = structuredClone(daConta(banco));
  const r = await atualizar(f);
  assert.equal(r.status, 200, r.texto);
  assert.deepEqual(r.body, { ok: true, mudou: true });
  assert.doesNotMatch(r.texto, /222333/, "a resposta nao traz o ID");
  const depois = daConta(banco);
  assert.equal(depois.id_pessoa, "222333");
  for (const k of ["usuario", "nome", "tipo", "colaborador", "colaborador_id", "ativo"]) assert.equal(depois[k], antes[k], k);

  const l = await listar(f);
  assert.deepEqual(l.body.contas.find((x) => x.usuario === "ficticia").idFicha, { diferente: false, podeAtualizar: false });
  // Segunda vez: ja confere, nada gravado.
  const n = gravacoesDaConta(banco).length;
  const de_novo = await atualizar(f);
  assert.deepEqual(de_novo.body, { ok: true, mudou: false });
  assert.equal(gravacoesDaConta(banco).length, n);
});

test("ficha antiga sem o campo, com o CPF: a conta segue o calculo pelo CPF", async () => {
  const fichaB = ficha("ficha-b", { cpf: "333.444.555-66", nome: "Pessoa Ficticia" });
  const { banco, f } = await montar(estado({ idConta: "333444", fichaB }));
  const l = await listar(f);
  assert.deepEqual(l.body.contas.find((x) => x.usuario === "ficticia").idFicha, { diferente: false, podeAtualizar: false });
  assert.equal((await atualizar(f)).body.mudou, false);
  assert.equal(daConta(banco).id_pessoa, "333444");
});

// ------------------------------------------------------------ a regua, solta

test("a regua: conta sem ID ganha o da ficha; numero no lugar do texto continua fora do formato", () => {
  const cad = [cadastroDaLeitura({ id: "a", colecao: "colaboradores", idPessoa: "444555", cpf: "44455566677" })];
  assert.deepEqual(idDaContaPelaFicha({ id: "x", colaborador_id: "a", id_pessoa: null }, cad),
    { diferente: true, podeAtualizar: true, idPessoa: "444555" });
  const numero = [cadastroDaLeitura({ id: "a", colecao: "colaboradores", idPessoa: 444555, cpf: "44455566677" })];
  assert.deepEqual(idDaContaPelaFicha({ id: "x", colaborador_id: "a", id_pessoa: "444555" }, numero),
    { diferente: true, podeAtualizar: false, motivo: "fora-do-formato" });
  // Contrato de freelancer nao e a ficha ligada.
  const contrato = [cadastroDaLeitura({ id: "a", colecao: "freelancers", idPessoa: "444555", cpf: "44455566677" })];
  assert.equal(idDaContaPelaFicha({ id: "x", colaborador_id: "a", id_pessoa: "111222" }, contrato), null);
  for (const m of ["fora-do-formato", "id-de-outra-pessoa", "id-em-outra-conta"]) assert.ok(MOTIVO_CONTA_NAO_ATUALIZA[m], m);
});
