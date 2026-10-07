import test from "node:test";
import assert from "node:assert/strict";
import { normOrcamento } from "../scripts/lib/mubi-cache.mjs";

test("orçamento reconhece os estados do ERP e as variantes de perda já suportadas", () => {
  for (const [status, situacao] of [
    ["ABERTO", "aberto"], [" em aberto ", "aberto"],
    ["APROVADO", "ganho"], [" aprovado ", "ganho"],
    ["CANCELADO", "perdido"], ["REPROVADO", "perdido"],
    ["RECUSADO", "perdido"], ["PERDIDO", "perdido"],
  ]) {
    const o = normOrcamento({ id: 1, status, valor_total: 100, valor_desconto: 10 }, 0);
    assert.equal(o.situacao, situacao, status);
    assert.equal(o.statusErp, status, "preserva o texto original para conferência");
    assert.equal(o.valor, 90, "mantém a regra do valor líquido");
  }
});

test("status ausente, vazio ou não reconhecido fica a conferir, sem inventar um desfecho", () => {
  for (const status of [undefined, null, "", "  ", 0, "PENDENTE", "FATURADO", "REABERTO", "APROVADO PARCIALMENTE", "NÃO APROVADO", "NÃO CANCELADO", "constructor"]) {
    const o = normOrcamento({ id: 1, status, data_aprovacao: "2026-10-07" }, 0);
    assert.equal(o.situacao, "conferir", `status: ${String(status)}`);
    assert.equal(o.statusErp, String(status ?? ""));
  }
});

for (const [status, situacao] of [
  ["Entregue", "ganho"],
  ["Em produção", "ganho"],
  ["Concluída", "ganho"],
  ["Ordem de serviço", "ganho"],
  ["Pausada", "ganho"],
  ["Em aberto", "aberto"],
  ["Reprovado", "perdido"],
  ["Cancelada", "perdido"],
]) {
  test(`orçamento reconhece o estado real do Mubisys: ${status}`, () => {
    const o = normOrcamento({ id: 42, status, valor_total: 100, valor_desconto: 10 }, 0);
    assert.equal(o.situacao, situacao);
    assert.equal(o.statusErp, status, "preserva o estado original, inclusive após conversão em O.S.");
    assert.equal(o.valor, 90, "continua descontando o desconto do cabeçalho");
  });
}

test("rótulos parecidos com os estados convertidos não viram ganhos automaticamente", () => {
  for (const status of ["Não entregue", "Parcialmente entregue", "Em produção externa", "Concluída parcialmente", "Pausada para revisão", "Ordem de serviço cancelada"]) {
    assert.equal(normOrcamento({ id: 42, status }, 0).situacao, "conferir", status);
  }
});
