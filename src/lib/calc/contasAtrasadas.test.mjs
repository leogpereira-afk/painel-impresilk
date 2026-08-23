/* Os casos que fazem a cobrança mentir. É a tela em que se liga para cliente
 * citando número: o pior erro possível é cobrar R$ 28 mil de quem deve 7.
 *   node --test src/lib/calc/contasAtrasadas.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { calcContasAtrasadas } from "./contasAtrasadas.js";

/* O calc usa o relógio de verdade, então as datas dos casos são RELATIVAS a
   hoje -- teste com data fixa passaria hoje e apodreceria em silêncio. */
const iso = (d) => d.toISOString().slice(0, 10);
const diasAtras = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

const CONFIG = {
  motivosAtraso: [
    { id: "esqueceu", nome: "Esqueceu", grupo: "cliente" },
    { id: "nota-errada", nome: "Nota errada", grupo: "interna" },
  ],
  gruposCausa: [
    { id: "cliente", nome: "Do cliente" },
    { id: "interna", nome: "Nossa" },
  ],
  parametros: { dataCorteAtrasados: "2024-01-01", diasEscala: 10, dsoMeta: 45, dsoAlerta: 60 },
};

const titulo = (id, extra = {}) => ({
  id, cliente: "CLIENTE A", cnpj: "11222333000144", nf: `nf-${id}`, os: "",
  valor: 100, vencimento: diasAtras(10), emissao: diasAtras(40), ...extra,
});

test("pagamento parcial: o total cobra o RESTA, e a conta viaja para a tela", () => {
  /* O caso real que custou R$ 46 mil cobrados a mais: valor já vem abatido
     pela carga, e valorTitulo/pago vão juntos para a tela MOSTRAR a conta. */
  const vm = calcContasAtrasadas(
    [titulo(1, { valor: 7000, valorTitulo: 28000, pago: 21000 })], {}, CONFIG);
  assert.equal(vm.kpis.totalAtrasado, 7000, "cobra o resta, nunca o cheio");
  assert.equal(vm.titulos[0].valorTitulo, 28000);
  assert.equal(vm.titulos[0].pago, 21000);
});

test("título antigo (antes do corte) sai dos totais mas não some da verdade", () => {
  const vm = calcContasAtrasadas([
    titulo(1, { valor: 500 }),
    titulo(2, { valor: 9000, vencimento: "2022-05-10" }),   // calote de 2022
  ], {}, CONFIG);
  assert.equal(vm.kpis.totalAtrasado, 500, "o calote não infla o número do dia");
  assert.equal(vm.qtdAtivos, 1);
  assert.equal(vm.antigas.qtd, 1, "mas a tela sabe que ele existe");
  assert.equal(vm.antigas.valor, 9000);
  assert.equal(vm.titulos.length, 2, "e ele continua acessível quando o gestor pedir");
});

test("três parcelas vencidas da MESMA NF valem uma — reincidente é quem atrasa de novo, não quem parcelou", () => {
  const vm = calcContasAtrasadas([
    titulo(1, { nf: "NF-77" }), titulo(2, { nf: "NF-77" }), titulo(3, { nf: "NF-77" }),
  ], {}, CONFIG);
  assert.equal(vm.kpis.reincidentesQtd, 0, "uma NF parcelada não é reincidência");
  const vm2 = calcContasAtrasadas([
    titulo(1, { nf: "NF-77" }), titulo(2, { nf: "NF-88" }),
  ], {}, CONFIG);
  assert.equal(vm2.kpis.reincidentesQtd, 2, "duas NFs distintas vencidas, aí sim");
});

test("o calote antigo não conta para a reincidência de hoje", () => {
  const vm = calcContasAtrasadas([
    titulo(1, { nf: "NF-1" }),
    titulo(2, { nf: "NF-2", vencimento: "2022-03-01" }),   // fora do corte
  ], {}, CONFIG);
  assert.equal(vm.titulos.find((t) => t.id === 1).reincidente, false,
    "um atraso vivo + um calote cortado não fazem um cliente crônico");
});

test("a vencer em 7 dias entra, com o cruzamento 'já deve' que vira ligação preventiva", () => {
  const vm = calcContasAtrasadas([
    titulo(1),                                              // vencido (10 dias)
    titulo(2, { vencimento: diasAtras(-3), valor: 800 }),   // vence em 3 dias
    titulo(3, { cliente: "OUTRO", cnpj: "99888777000155", vencimento: diasAtras(-2), valor: 50 }),
  ], {}, CONFIG);
  assert.equal(vm.aVencer.qtd, 2);
  assert.equal(vm.aVencer.deQuemJaDeve, 1, "o CLIENTE A já tem vencido — é a ligação que evita o atraso");
  assert.equal(vm.aVencer.valorDeQuemJaDeve, 800);
});

test("motivo marcado vira grupo, e origem interna aparece separada", () => {
  const vm = calcContasAtrasadas(
    [titulo(1), titulo(2, { nf: "NF-2" })],
    { 1: { motivoId: "nota-errada" } },
    CONFIG);
  const t = vm.titulos.find((x) => x.id === 1);
  assert.equal(t.grupo, "interna");
  assert.equal(t.grupoNome, "Nossa");
  const interna = vm.porOrigem.find((o) => o.grupo === "interna");
  assert.equal(interna.valor, 100, "o valor da falha nossa aparece com nome");
});
