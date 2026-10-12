/* A CONTA DE ACESSO COPIA O ID GRAVADO NA FICHA DO RH (D-004 do RH, D-015 do
 * PCP, 12/10/2026). So calcula pelo CPF quando o campo falta; gravado fora do
 * formato ou que ja e de outra pessoa nao e copiado. Dados ficticios: CPFs
 * inventados, nenhum de pessoa real.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { idPessoaDaFicha, MOTIVO_ID_NAO_COPIADO } from "../supabase/functions/_shared/id-pessoa-acesso.mjs";

const ficha = (id, registro) => ({ colecao: "colaboradores", id, registro: { nome: "Pessoa " + id, ...registro } });
const contrato = (id, registro) => ({ colecao: "freelancers", id, registro: { nome: "Contrato " + id, ...registro } });

test("ficha antiga, sem o campo: calcula pelo CPF como antes", () => {
  const a = ficha("a", { cpf: "111.222.333-44" });
  assert.deepEqual(idPessoaDaFicha(a, [a]), { idPessoa: "111222" });
  assert.deepEqual(idPessoaDaFicha(ficha("b", {}), []), { idPessoa: "" }, "sem CPF e sem campo, sem ID");
});

test("o gravado manda, mesmo quando o CPF foi corrigido depois", () => {
  const a = ficha("a", { cpf: "999.888.777-66", idPessoa: "111222" });
  assert.deepEqual(idPessoaDaFicha(a, [a, ficha("c", { cpf: "55566677788" })]), { idPessoa: "111222" });
});

test("o caso ruim: gravado fora do formato nao e copiado, fica o calculo", () => {
  for (const ruim of ["11122", "1112223", "11a222", " 111222", 111222, "111.222"]) {
    const a = ficha("a", { cpf: "33344455566", idPessoa: ruim });
    const r = idPessoaDaFicha(a, [a]);
    assert.equal(r.idPessoa, "333444", `idPessoa ${JSON.stringify(ruim)}`);
    assert.equal(r.motivo, "fora-do-formato");
  }
  const semCpf = ficha("a", { idPessoa: "12-345" });
  assert.deepEqual(idPessoaDaFicha(semCpf, [semCpf]), { idPessoa: "", motivo: "fora-do-formato" });
  assert.ok(MOTIVO_ID_NAO_COPIADO["fora-do-formato"]);
});

test("o caso ruim: ID gravado que ja e de outra pessoa nao e copiado", () => {
  const a = ficha("a", { cpf: "33344455566", idPessoa: "111222" });
  // outra ficha com o mesmo ID pelo CPF (sem o campo), CPF diferente
  const b = ficha("b", { cpf: "11122299900" });
  let r = idPessoaDaFicha(a, [a, b]);
  assert.equal(r.idPessoa, "333444", "fica o calculo pelo CPF");
  assert.equal(r.motivo, "id-de-outra-pessoa");
  assert.deepEqual(r.outro, { colecao: "colaboradores", id: "b" });
  // outra ficha com o mesmo ID gravado
  const c = ficha("c", { cpf: "77788899900", idPessoa: "111222" });
  r = idPessoaDaFicha(a, [a, c]);
  assert.equal(r.motivo, "id-de-outra-pessoa");
  // contrato de freelancer de outra pessoa com o mesmo ID gravado
  r = idPessoaDaFicha(a, [a, contrato("f1", { cpf: "77788899900", idPessoa: "111222" })]);
  assert.equal(r.motivo, "id-de-outra-pessoa");
  assert.deepEqual(r.outro, { colecao: "freelancers", id: "f1" });
  // outro cadastro sem CPF nenhum, mas com o ID gravado: nada prova ser a mesma pessoa
  r = idPessoaDaFicha(a, [a, ficha("d", { idPessoa: "111222" })]);
  assert.equal(r.motivo, "id-de-outra-pessoa");
  // ficha sem CPF com gravado de outra pessoa: sem calculo, sem ID
  const semCpf = ficha("e", { idPessoa: "111222" });
  assert.deepEqual(idPessoaDaFicha(semCpf, [semCpf, b]), { idPessoa: "", motivo: "id-de-outra-pessoa", outro: { colecao: "colaboradores", id: "b" } });
});

test("mesmo CPF em outro cadastro (o contrato de quem saiu) nao e outra pessoa", () => {
  const a = ficha("a", { cpf: "33344455566", idPessoa: "111222" });
  const f = contrato("f1", { cpf: "333.444.555-66", idPessoa: "111222" });
  assert.deepEqual(idPessoaDaFicha(a, [a, f]), { idPessoa: "111222" });
});

test("contrato com CPF que nao confere nao da ID pelo CPF (regua do RH)", () => {
  const a = ficha("a", { cpf: "33344455566", idPessoa: "111222" });
  // 11122233344 nao passa nos verificadores: o contrato nao tem ID, nao colide
  assert.deepEqual(idPessoaDaFicha(a, [a, contrato("f2", { cpf: "11122233344" })]), { idPessoa: "111222" });
  // 11122233396 confere: o contrato tem o ID 111222, de outra pessoa
  assert.equal(idPessoaDaFicha(a, [a, contrato("f3", { cpf: "11122233396" })]).motivo, "id-de-outra-pessoa");
});

test("a function painel-acesso usa a regua e le fichas e contratos", async () => {
  const src = await readFile(new URL("../supabase/functions/painel-acesso/index.ts", import.meta.url), "utf8");
  const corpo = src.slice(src.indexOf("async function amarrarNaFicha"), src.indexOf("async function alvoParaEscrever"));
  assert.match(corpo, /\.in\("colecao", \["colaboradores", "freelancers"\]\)/);
  assert.match(corpo, /r\.colecao === "colaboradores" && normalizar/, "a ficha e achada so entre as fichas");
  assert.match(corpo, /idPessoaDaFicha\(acha\[0\], data \?\? \[\]\)/);
  assert.match(corpo, /console\.warn\(/, "o gravado recusado deixa aviso no log");
  assert.doesNotMatch(corpo, /cpf\.slice\(0, 6\)/, "o calculo pelo CPF mora so na regua");
});
