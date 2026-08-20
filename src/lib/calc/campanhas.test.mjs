/* Os casos que fazem a campanha mentir.
 *   node --test src/lib/calc/campanhas.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  resumoDaCampanha, resumoGeralCampanhas, totaisDasCampanhas, compradoresDaCampanha, fichaDaOS,
  extratoDaCampanha,
} from "./campanhas.js";

const os = (id, cliente, valor, extra = {}) => ({
  id, numero: `2${id}`, cliente, data: "2026-03-10", cnpj: "", valor, ...extra,
});

test("o vendido é a soma das O.S. escolhidas, e quem comprou vem separado", () => {
  const ordens = [os(1, "Candidato A", 49495), os(2, "Candidato B", 8500), os(3, "Candidato A", 640)];
  const c = { nome: "Eleições 2026", ano: "2026",
              os: Object.fromEntries(ordens.map((o) => [o.id, fichaDaOS(o)])) };
  const r = resumoDaCampanha(c, ordens);
  assert.equal(r.vendido, 58635);
  assert.equal(r.compradores, 2);
  assert.deepEqual(r.porCliente.map((x) => [x.cliente, x.valor]),
    [["Candidato A", 50135], ["Candidato B", 8500]]);
});

test("a maior fatia diz se a campanha é um cliente só ou um mercado", () => {
  const ordens = [os(1, "A", 9000), os(2, "B", 1000)];
  const c = { os: Object.fromEntries(ordens.map((o) => [o.id, fichaDaOS(o)])) };
  assert.equal(resumoDaCampanha(c, ordens).maiorFatia, 0.9);
});

test("campanha vazia não inventa fatia nem percentual", () => {
  const r = resumoDaCampanha({ os: {} }, [os(9, "X", 1)]);
  assert.equal(r.vendido, 0);
  assert.equal(r.maiorFatia, null);
  assert.equal(r.pct, null, "sem meta não há percentual");
  assert.equal(r.falta, null);
});

test("a meta só entra quando existe -- 0% num evento sem meta seria invenção", () => {
  const ordens = [os(1, "A", 300)];
  const semMeta = resumoDaCampanha({ os: { 1: fichaDaOS(ordens[0]) } }, ordens);
  assert.equal(semMeta.pct, null);
  const comMeta = resumoDaCampanha({ meta: 1000, os: { 1: fichaDaOS(ordens[0]) } }, ordens);
  assert.equal(comMeta.pct, 0.3);
  assert.equal(comMeta.falta, 700);
});

test("cliente ligado que não comprou nada NÃO conta como comprador", () => {
  // Senão "12 compradores" incluiria quem só foi pesquisado na busca.
  const ordens = [os(1, "A", 500)];
  const c = { clientes: [{ chave: "A", nome: "A" }, { chave: "B", nome: "B" }],
              os: { 1: fichaDaOS(ordens[0]) } };
  assert.equal(resumoDaCampanha(c, ordens).compradores, 1);
});

test("a campanha herda os avisos da permuta: divergência não se esconde", () => {
  const antes = os(1, "A", 300);
  const c = { os: { 1: fichaDaOS(antes) } };
  // O ERP corrigiu para 450.
  const r = resumoDaCampanha(c, [os(1, "A", 450)]);
  assert.equal(r.vendido, 450, "o valor do ERP manda");
  assert.equal(r.mudaram, 1);
  // E lista vazia não vira "tudo cancelado".
  const semErp = resumoDaCampanha(c, []);
  assert.equal(semErp.sumiram, 0);
  assert.equal(semErp.semConferir, true);
  assert.equal(semErp.vendido, 300, "se sustenta no congelado");
});

test("a lista abre pelo ANO CORRENTE, não pelo valor", () => {
  // Uma eleição de 2022 não pode empurrar para baixo a que está acontecendo.
  const ordens = [os(1, "A", 100), os(2, "B", 90000)];
  const g = resumoGeralCampanhas({
    velha: { nome: "Eleições 2022", ano: "2022", os: { 2: fichaDaOS(ordens[1]) } },
    atual: { nome: "Eleições 2026", ano: "2026", os: { 1: fichaDaOS(ordens[0]) } },
    fim:   { nome: "Festa 2026", ano: "2026", encerrada: true, os: {} },
  }, ordens, 2026);
  assert.deepEqual(g.map((c) => c.nome), ["Eleições 2026", "Eleições 2022", "Festa 2026"]);
});

test("os totais do ano não somam o mesmo comprador duas vezes", () => {
  const ordens = [os(1, "A", 100), os(2, "A", 200), os(3, "B", 50)];
  const lista = resumoGeralCampanhas({
    x: { nome: "X", ano: "2026", os: { 1: fichaDaOS(ordens[0]) } },
    y: { nome: "Y", ano: "2026", os: { 2: fichaDaOS(ordens[1]), 3: fichaDaOS(ordens[2]) } },
    z: { nome: "Z", ano: "2025", os: {} },
  }, ordens, 2026);
  const t = totaisDasCampanhas(lista, 2026);
  assert.equal(t.quantas, 3);
  assert.equal(t.quantasNoAno, 2);
  assert.equal(t.vendidoNoAno, 350);
  assert.equal(t.compradoresNoAno, 2, "A comprou nas duas e conta uma vez");
  assert.equal(t.osNoAno, 3);
});

test("o ranking soma o mesmo comprador de várias campanhas", () => {
  const ordens = [os(1, "A", 100), os(2, "A", 200), os(3, "B", 500)];
  const lista = resumoGeralCampanhas({
    x: { nome: "X", ano: "2026", os: { 1: fichaDaOS(ordens[0]) } },
    y: { nome: "Y", ano: "2026", os: { 2: fichaDaOS(ordens[1]), 3: fichaDaOS(ordens[2]) } },
  }, ordens, 2026);
  const r = compradoresDaCampanha(lista);
  assert.deepEqual(r.map((x) => [x.cliente, x.valor, x.qtd]), [["B", 500, 1], ["A", 300, 2]]);
});

test("venda sem O.S. entra no total do evento", () => {
  const ordens = [os(1, "A", 1000)];
  const c = {
    os: Object.fromEntries(ordens.map((o) => [o.id, fichaDaOS(o)])),
    lancamentos: { l1: { data: "2026-04-02", descricao: "Painel entregue direto", valor: 500 } },
  };
  const r = resumoDaCampanha(c, ordens);
  assert.equal(r.vendidoOS, 1000);
  assert.equal(r.semOS, 500);
  assert.equal(r.vendido, 1500, "o evento rendeu os dois");
  assert.equal(r.vendasSemOS.length, 1);
});

test("a venda sem O.S. NÃO encolhe a fatia de quem comprou", () => {
  /* Este é o erro que o denominador errado cria: o comprador único levou 100%
     do que passou por O.S., e somar ao denominador uma venda que não é de
     ninguém faria a tela dizer 67% -- uma fatia que não existe. */
  const ordens = [os(1, "A", 1000)];
  const c = {
    os: Object.fromEntries(ordens.map((o) => [o.id, fichaDaOS(o)])),
    lancamentos: { l1: { data: "2026-04-02", descricao: "sem O.S.", valor: 500 } },
  };
  assert.equal(resumoDaCampanha(c, ordens).maiorFatia, 1);
});

test("lançamento sem valor não conta, e o campo em texto com vírgula conta", () => {
  const c = { os: {}, lancamentos: {
    vazio: { data: "2026-01-01", descricao: "rascunho" },
    texto: { data: "2026-01-02", descricao: "acerto", valor: "1.234,50".replace(".", "") },
  } };
  // "1234,50" -- é assim que o campo da tela entrega antes do paraNumero.
  assert.equal(resumoDaCampanha(c, []).semOS, 1234.5);
});

test("o extrato de papel percorre o calendário, não o cadastro", () => {
  const ordens = [
    os(1, "B", 100, { data: "2026-05-20" }),
    os(2, "A", 900, { data: "2026-02-01" }),
  ];
  const c = { os: Object.fromEntries(ordens.map((o) => [o.id, fichaDaOS(o)])) };
  const e = extratoDaCampanha(c, ordens);
  assert.deepEqual(e.porData.map((l) => l.data), ["2026-02-01", "2026-05-20"]);
  assert.deepEqual(e.porCliente.map((x) => x.cliente), ["A", "B"], "o ranking continua por valor");
});
