/* A REGRA DA SENHA NA TELA, comecando pelos casos ruins.
 *
 * A tela repete a regra do contrato das senhas (minimo 6, ate 72 BYTES, sem
 * espaco nas pontas, nada aparado) para a pessoa ver o que falta ANTES de
 * enviar. Estes testes prendem as duas coisas que ja deram errado em outro
 * lugar: a senha aparada/cortada calada (o `texto(senha, 80)` antigo) e o teto
 * contado em letras quando o bcrypt conta bytes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  conferirSenha, senhaPassa, prepararDefinicao, prepararTroca, classificarErroTroca,
} from "../src/lib/regra-senha.mjs";

const falhas = (regras) => regras.filter((r) => !r.ok).map((r) => r.id);

test("5 caracteres nao passa; 6 passa", () => {
  assert.deepEqual(falhas(conferirSenha("abcde")), ["min"]);
  assert.deepEqual(falhas(conferirSenha("abcdef")), []);
});

test("o teto e de 72 BYTES: acento conta dobrado e a regra diz isso", () => {
  assert.deepEqual(falhas(conferirSenha("a".repeat(72))), []);
  assert.deepEqual(falhas(conferirSenha("a".repeat(73))), ["max"]);
  // 37 letras com acento = 74 bytes: parece curta e nao cabe.
  const acentuada = "é".repeat(37);
  const r = conferirSenha(acentuada);
  assert.deepEqual(falhas(r), ["max"]);
  assert.match(r.find((x) => x.id === "max").texto, /acento conta dobrado/);
  assert.doesNotMatch(conferirSenha("a".repeat(10)).find((x) => x.id === "max").texto, /acento/);
});

test("espaco nas pontas e recusado, e nada e aparado", () => {
  assert.deepEqual(falhas(conferirSenha(" senhaboa")), ["pontas"]);
  assert.deepEqual(falhas(conferirSenha("senhaboa ")), ["pontas"]);
  assert.deepEqual(falhas(conferirSenha("senha boa")), []);
  const p = prepararDefinicao({ modo: "escolher", nova: " senhaboa", repetida: " senhaboa" });
  assert.equal(p.ok, false);
  assert.equal(p.senha, undefined, "senha furada nao sai da tela");
});

test("na troca da propria senha, a nova tem de ser diferente da atual", () => {
  const r = conferirSenha("mesma-senha", { atual: "mesma-senha", repetida: "mesma-senha" });
  assert.deepEqual(falhas(r), ["diferente"]);
  assert.ok(senhaPassa(conferirSenha("outra-senha", { atual: "mesma-senha", repetida: "outra-senha" })));
});

test("as duas iguais", () => {
  assert.deepEqual(falhas(conferirSenha("senha-boa", { repetida: "senha-bo" })), ["iguais"]);
  assert.deepEqual(falhas(conferirSenha("", { repetida: "" })), ["min", "iguais"]);
});

test("senha para todos: gerar nao manda senha; escolher manda a digitada, intacta", () => {
  assert.deepEqual(prepararDefinicao({ modo: "gerar", nova: "x", repetida: "y" }), { ok: true, senha: undefined, regras: [] });
  const p = prepararDefinicao({ modo: "escolher", nova: "Pedra Verde 12", repetida: "Pedra Verde 12" });
  assert.equal(p.ok, true);
  assert.equal(p.senha, "Pedra Verde 12");
  assert.equal(prepararDefinicao({ modo: "escolher", nova: "curta", repetida: "curta" }).ok, false);
});

test("minha senha: sem a atual nao se envia", () => {
  const p = prepararTroca({ atual: "", nova: "nova-senha", repetida: "nova-senha" });
  assert.equal(p.ok, false);
  assert.equal(p.faltaAtual, true);
  assert.equal(prepararTroca({ atual: "velha-senha", nova: "nova-senha", repetida: "nova-senha" }).ok, true);
});

test("erros da troca: senha atual errada vai para o campo; o resto vira aviso", () => {
  assert.equal(classificarErroTroca(new Error("Senha atual incorreta.")).onde, "atual");
  const e401 = Object.assign(new Error("qualquer"), { status: 401 });
  assert.equal(classificarErroTroca(e401).onde, "atual");
  // 409 e 503 pedem espera: aviso amarelo. 429 e 500: erro.
  assert.deepEqual(
    [409, 503].map((status) => classificarErroTroca(Object.assign(new Error("x"), { status })).tom),
    ["aviso", "aviso"]);
  assert.equal(classificarErroTroca(new Error("Já há uma troca de senha em andamento. Espere um minuto e tente de novo.")).tom, "aviso");
  assert.equal(classificarErroTroca(new Error("Muitas tentativas seguidas. Espere 15 minutos e tente de novo.")).tom, "erro");
  assert.equal(classificarErroTroca(new Error("A troca não foi concluída. A sua senha anterior continua valendo em todos os sistemas.")).onde, "aviso");
});
