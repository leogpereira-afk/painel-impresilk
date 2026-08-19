/* MARCAR DUAS PESSOAS SEGUIDAS NA PERMUTA — o defeito relatado em 19/08/2026:
 * "marquei duas pessoas em permutas e não ficou".
 *
 * Roda com o node do repo, sem framework:
 *   node --test src/lib/calc/ligarCliente.test.mjs
 *
 * A tela montava a lista nova a partir de `permuta.clientes` do RENDER e mandava
 * o ARRAY INTEIRO. O servidor funde raso (`v_reg || p_campos`), então o array
 * recebido substitui o guardado. Entre dois cliques rápidos o segundo ainda
 * enxerga a lista velha — e grava por cima do primeiro.
 *
 * O botão não travava durante o salvamento e a lista de busca só fechava DEPOIS
 * da resposta, então a janela para o segundo clique existia de verdade.
 *
 * Aqui os dois jeitos estão lado a lado: o antigo (que perde) e o novo (que não).
 */

import test from "node:test";
import assert from "node:assert/strict";

/** O servidor: funde raso e devolve o registro novo. */
function servidor(guardado, campos) {
  return { ...guardado, ...campos };
}

/** COMO ERA: a lista sai do que a tela tinha no momento do clique. */
function ligarComoEra(snapshotDaTela, servidorRef, cliente) {
  const atuais = snapshotDaTela.clientes || [];
  servidorRef.reg = servidor(servidorRef.reg, { clientes: [...atuais, cliente] });
}

/** COMO FICOU: a lista sai do ESTADO MAIS NOVO, não do render. */
function ligarComoFicou(servidorRef, cliente) {
  const atuais = servidorRef.reg.clientes || [];
  if (atuais.some((x) => x.chave === cliente.chave)) return;
  servidorRef.reg = servidor(servidorRef.reg, { clientes: [...atuais, cliente] });
}

const A = { chave: "a", nome: "Cliente A" };
const B = { chave: "b", nome: "Cliente B" };

test("como era: dois cliques rápidos e uma pessoa some", () => {
  const srv = { reg: { clientes: [] } };
  // A tela renderizou com a lista vazia; os DOIS cliques enxergam esse mesmo
  // instante, porque a resposta do primeiro ainda não voltou.
  const daTela = { clientes: [] };
  ligarComoEra(daTela, srv, A);
  ligarComoEra(daTela, srv, B);
  assert.equal(srv.reg.clientes.length, 1, "era isto que o Leonardo via: sobrou uma");
  assert.equal(srv.reg.clientes[0].chave, "b", "a segunda apagou a primeira");
});

test("como ficou: dois cliques rápidos e as duas ficam", () => {
  const srv = { reg: { clientes: [] } };
  ligarComoFicou(srv, A);
  ligarComoFicou(srv, B);
  assert.equal(srv.reg.clientes.length, 2);
  assert.deepEqual(srv.reg.clientes.map((c) => c.chave), ["a", "b"]);
});

test("clicar duas vezes na MESMA pessoa não duplica", () => {
  /* Com a lista velha, a checagem de repetido também falhava: ela comparava
     contra um retrato que ainda não tinha a pessoa recém-adicionada. */
  const srv = { reg: { clientes: [] } };
  ligarComoFicou(srv, A);
  ligarComoFicou(srv, A);
  assert.equal(srv.reg.clientes.length, 1);
});

test("três seguidas, todas ficam", () => {
  const srv = { reg: { clientes: [] } };
  for (const c of [A, B, { chave: "c", nome: "Cliente C" }]) ligarComoFicou(srv, c);
  assert.equal(srv.reg.clientes.length, 3);
});

test("tirar uma não leva as outras junto", () => {
  const srv = { reg: { clientes: [A, B] } };
  const atuais = srv.reg.clientes;
  srv.reg = servidor(srv.reg, { clientes: atuais.filter((x) => x.chave !== "a") });
  assert.deepEqual(srv.reg.clientes.map((c) => c.chave), ["b"]);
});

/* A FILA — o que o conserto acrescentou no `mexer`. Aqui ela está isolada do
   React, para ficar claro que a garantia é da fila e não do desenho. */
function criarFila() {
  let fila = Promise.resolve();
  return (tarefa) => {
    const p = fila.then(tarefa);
    // A fila não pode morrer numa falha, senão trava tudo que vier depois.
    fila = p.then(() => {}, () => {});
    return p;
  };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

test("fila: dois cliques quase simultâneos, os dois entram", async () => {
  const srv = { reg: { clientes: [] } };
  const naFila = criarFila();
  // A rede do segundo é MAIS RÁPIDA que a do primeiro — sem fila, ele chegaria
  // antes e o primeiro sobrescreveria depois.
  const marcar = (c, atraso) => naFila(async () => {
    const atuais = srv.reg.clientes || [];
    await esperar(atraso);
    srv.reg = { ...srv.reg, clientes: [...atuais, c] };
  });
  await Promise.all([marcar(A, 40), marcar(B, 1)]);
  assert.deepEqual(srv.reg.clientes.map((c) => c.chave), ["a", "b"]);
});

test("fila: uma falha no meio não trava as seguintes", async () => {
  const srv = { reg: { clientes: [] } };
  const naFila = criarFila();
  const ok = (c) => naFila(async () => {
    srv.reg = { ...srv.reg, clientes: [...(srv.reg.clientes || []), c] };
  });
  const falha = () => naFila(async () => { throw new Error("rede caiu"); });
  await ok(A);
  await falha().catch(() => {});
  await ok(B);
  assert.deepEqual(srv.reg.clientes.map((c) => c.chave), ["a", "b"], "a de depois da falha entrou");
});
