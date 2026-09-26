/* O SELO DE CADA SISTEMA (Visao geral e aba Sistemas usam a mesma regra).
 *
 * Verde so quando e verdade: sistema com zero contas ganhava "em ordem" e
 * verde onde nao ha nada e mentira. E o mais grave vem primeiro, com "+N" para
 * o resto: um selo por linha.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { contasDoSistema, seloDoSistema, contagemDoSistema, ehExterna } from "../src/lib/acesso-sistema.mjs";

const papel = (sistema, extra = {}) => ({ sistema, login: "x", real: { existe: true, ativo: true, login: "x", permissoes: ["orcamentos"], ...extra } });
const conta = (usuario, papeis) => ({ usuario, nome: usuario, papeis });

test("zero contas e ninguem entra: 'ninguem entra', nunca 'em ordem'", () => {
  const d = contasDoSistema("vof", [], {}, {});
  const s = seloDoSistema(d);
  assert.equal(s.texto, "ninguém entra");
  assert.equal(s.tom, "neutral");
  assert.equal(contagemDoSistema(d), "nenhuma conta");
});

test("'em ordem' so quando nada mais vale", () => {
  const d = contasDoSistema("pcp", [conta("a", [papel("pcp")])], {}, {});
  assert.deepEqual(seloDoSistema(d), { tom: "ok", texto: "em ordem", mais: 0, todas: [] });
  assert.equal(contagemDoSistema(d), "1 com conta");
});

test("quem entra sem senha tira o verde, mesmo com todas as contas certas", () => {
  const d = contasDoSistema("pcp", [conta("a", [papel("pcp")])], {}, { pcp: [{ nome: "Instalador", como: "nome" }] });
  const s = seloDoSistema(d);
  assert.equal(s.tom, "warn");
  assert.equal(s.texto, "1 entra sem senha");
});

test("o mais grave primeiro, e +N para o resto", () => {
  const contas = [
    conta("a", [{ sistema: "pcp", login: "fantasma", real: { existe: false } }]),
    conta("b", [papel("pcp", { temporaria: true })]),
  ];
  const d = contasDoSistema("pcp", contas, { pcp: [{ login: "solta", ativo: true }] }, {});
  const s = seloDoSistema(d);
  assert.equal(s.tom, "bad");
  assert.equal(s.texto, "1 sem conta lá");
  assert.equal(s.mais, 2);
  assert.deepEqual(s.todas.map((x) => x.texto), ["1 sem conta lá", "1 sem dono", "1 senha provisória"]);
});

test("Painel que existe e nao abre nada e vermelho", () => {
  const d = contasDoSistema("painel", [conta("a", [{ ...papel("painel"), sistema: "painel", real: { existe: true, ativo: true, permissoes: [] } }])], {}, {});
  assert.equal(seloDoSistema(d).texto, "1 sem nenhuma parte");
});

test("gestao externa: Domo, Bosques e o que nao e integrado", () => {
  assert.equal(ehExterna("domo"), true);
  assert.equal(ehExterna("pcp", { estado: "nao_integrado" }), true);
  assert.equal(ehExterna("pcp", { estado: "consultado" }), false);
  assert.equal(seloDoSistema({}, { externa: true }).texto, "gestão externa");
  assert.equal(contagemDoSistema({}, { externa: true }), "administrado lá dentro");
});

test("elenco sem conta nao conta duas vezes quem ja tem conta", () => {
  const d = contasDoSistema("rh", [conta("ana", [papel("rh")])], {}, { rh: [{ nome: "x", como: "cadastro" }, { nome: "Outra", como: "cadastro" }] });
  assert.deepEqual(d.outros.map((e) => e.nome), ["Outra"]);
});
