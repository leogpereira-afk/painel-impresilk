/* Os casos que fazem a mesa de fechamento mentir — as regras de balde decidem
 * a fila de trabalho do dia.
 *   node --test src/lib/calc/orcamentos.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import { calcOrcamentos, estadoDe, ehCompraFutura } from "./orcamentos.js";

const HOJE = "2026-08-23";
const CONFIG = {
  vendedores: [{ id: "v1", nome: "Michelle" }],
  motivosPerda: [
    { id: "compra-futura", nome: "Compra futura" },
    { id: "preco", nome: "Preço" },
  ],
  parametros: { valorMinimoOrcamento: 0, dataCorteOrcamentos: "", diasParado: 7 },
};
const orc = (id, extra = {}) => ({
  id, numero: `${1000 + id}`, cliente: "CLIENTE", vendedorId: "v1",
  situacao: "aberto", valor: 1000, margem: 300, dataEnvio: "2026-08-01", ...extra,
});
const calc = (orcs, ovs = {}) => calcOrcamentos(orcs, ovs, CONFIG, { hoje: HOJE });

test("promessa vencida de COMPRA FUTURA grita — o selo e o número Atrasados", () => {
  /* O defeito consertado na auditoria: o selo neutro engolia a promessa
     vencida e o item sumia de todas as superfícies de urgência. Este teste
     segura o conserto. */
  const vm = calc(
    [orc(1, { situacao: "perdido", motivoErp: "compra futura" })],
    { 1: { proximoToque: "2026-08-20" } },   // prometido para o passado
  );
  const item = vm.lista.find((o) => o.id === 1);
  assert.equal(item.recall, true);
  assert.equal(item.estado.chave, "recall-atrasado");
  assert.equal(item.estado.tom, "bad", "vermelho, não o warn neutro");
  assert.equal(vm.recorte.atrasados.qtd, 1, "e conta no número Atrasados");
});

test("recall com promessa FUTURA espera em paz — não é atraso", () => {
  const vm = calc(
    [orc(1, { situacao: "perdido", motivoErp: "compra futura" })],
    { 1: { proximoToque: "2026-09-10" } },
  );
  assert.equal(vm.lista[0].estado.chave, "recall");
  assert.equal(vm.recorte.atrasados.qtd, 0);
});

test("baixa manual sobrepõe o ERP, e o desfazer volta ao que o ERP diz", () => {
  const aberto = orc(1);
  const comBaixa = calc([aberto], { 1: { situacao: "ganho" } });
  assert.equal(comBaixa.lista[0].situacao, "ganho", "a direção deu baixa");
  const desfeita = calc([aberto], { 1: {} });
  assert.equal(desfeita.lista[0].situacao, "aberto", "sem override, vale o ERP");
});

test("validade ausente não derruba o cálculo nem inventa vencimento", () => {
  const vm = calc([orc(1, { validade: undefined })]);
  assert.equal(vm.lista[0].vencido, false, "sem validade não há 'vencido'");
});

test("data de envio lixo sai da mesa e é CONTADA, não engolida", () => {
  const vm = calc([orc(1), orc(2, { dataEnvio: "banana" })]);
  assert.equal(vm.lista.length, 1);
});

test("compra futura casa por id E por texto do ERP, sem pegar parecido", () => {
  assert.equal(ehCompraFutura({ motivoPerdaId: "compra-futura" }), true);
  assert.equal(ehCompraFutura({ motivoPerdaNome: "COMPRA FUTURA" }), true);
  assert.equal(ehCompraFutura({ motivoPerdaNome: "Preço" }), false);
});

test("o selo é UM por linha e a ordem é a da urgência", () => {
  assert.equal(estadoDe({ situacao: "ganho", recall: true }).chave, "ganho", "ganho vence tudo");
  assert.equal(estadoDe({ situacao: "aberto", toqueAtrasado: true, proximoToque: "2026-08-20", adiado: false }).chave, "atrasado");
  assert.equal(estadoDe({ situacao: "aberto" }).chave, "sem");
});
