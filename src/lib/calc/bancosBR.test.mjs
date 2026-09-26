import test from "node:test";
import assert from "node:assert/strict";
import { bancoPeloNome, codigoDaConta, conflitoDoCodigo, logoDaConta, logoValida, seloDoBanco, textoSobre, CATALOGO_BANCOS } from "./bancosBR.js";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

test("nome que não diz o banco, ou diz dois, não vira código", () => {
  assert.equal(bancoPeloNome(""), null);
  assert.equal(bancoPeloNome("Banco Interior"), null, "palavra inteira: interior não é Inter");
  assert.equal(bancoPeloNome("Conta da loja"), null);
  assert.equal(bancoPeloNome("BTG 237"), null, "o nome diz BTG e o número diz Bradesco: não chuta");
  assert.equal(bancoPeloNome("Banco 999"), null, "número fora do catálogo");
  assert.equal(codigoDaConta({ banco: "Conta da loja" }), null);
});

test("os nomes cadastrados hoje (25/09/2026) acham o banco", () => {
  const casos = {
    "BTG 208": "208", "BTG 208 - Investimento": "208", "Sicoob Credinor": "756", "Sicoob Credinosso": "756",
    "BNB": "004", "BB": "001", "C6 Bank 336": "336", "Caixa - LGP": "104", "Itau": "341", "Santander": "033",
    "Itaú Unibanco": "341", "Banco do Brasil": "001", "Nubank": "260", "Mercado Pago": "323",
  };
  for (const [nome, cod] of Object.entries(casos)) assert.equal(bancoPeloNome(nome)?.codigo, cod, nome);
  assert.equal(bancoPeloNome("756")?.codigo, "756", "só o número, de banco conhecido");
});

test("código cadastrado vence a dedução; deduzido vem marcado", () => {
  assert.deepEqual({ ...codigoDaConta({ banco: "Sicoob Credinor" }), banco: undefined }, { codigo: "756", deduzido: true, banco: undefined });
  const c = codigoDaConta({ banco: "Sicoob Credinor", codigoBanco: "089" });
  assert.equal(c.codigo, "089"); assert.equal(c.deduzido, false); assert.equal(c.banco, null, "banco fora da lista continua valendo, sem cor");
  assert.equal(codigoDaConta({ banco: "BTG", codigoBanco: "20" }).codigo, "208", "cadastro inválido não vale; volta a dedução");
});

test("logo: só imagem de verdade; anexar numa conta vale para as outras do mesmo banco", () => {
  assert.equal(logoValida(PNG), true);
  assert.equal(logoValida("data:image/svg+xml;base64,PHN2Zz4="), false, "SVG pode carregar script");
  assert.equal(logoValida("javascript:alert(1)"), false);
  assert.equal(logoValida("data:image/png;base64," + "A".repeat(300000)), false, "grande demais");
  const a = { banco: "Sicoob Credinor", logo: PNG }, b = { banco: "Sicoob Credinosso" }, c = { banco: "BTG 208" };
  assert.equal(logoDaConta(b, [a, b, c]), PNG);
  assert.equal(logoDaConta(c, [a, b, c]), "", "outro banco não herda");
});

test("selo sem logo: nome curto, cor da marca e texto legível", () => {
  const bb = seloDoBanco({ banco: "BB" });
  assert.equal(bb.sigla, "BB"); assert.equal(bb.texto, "#0F172A", "amarelo do BB pede texto escuro");
  assert.equal(seloDoBanco({ banco: "BTG 208" }).texto, "#FFFFFF");
  const x = seloDoBanco({ banco: "Cooperativa Regional" });
  assert.equal(x.sigla, "Cooperat"); assert.match(x.cor, /^hsl/);
  assert.equal(seloDoBanco({ banco: "Cooperativa Regional" }).cor, x.cor, "a mesma conta, a mesma cor");
  assert.equal(textoSobre("#FFFFFF"), "#0F172A");
});

test("catálogo sem código repetido e com 3 dígitos", () => {
  const cods = CATALOGO_BANCOS.map((b) => b.codigo);
  assert.equal(new Set(cods).size, cods.length);
  for (const c of cods) assert.match(c, /^\d{3}$/);
});

/* REVISÃO ADVERSARIAL DE 25/09/2026. */
test("BV é 413 desde 2021, inclusive quando o nome traz o número antigo", () => {
  assert.equal(bancoPeloNome("Banco BV")?.codigo, "413");
  assert.equal(bancoPeloNome("BV 413")?.codigo, "413");
  assert.equal(bancoPeloNome("Votorantim")?.codigo, "413");
  assert.equal(bancoPeloNome("BV 655"), null, "número diferente do banco do nome anula");
});
test("dois bancos no nome, ou números colados, não viram código", () => {
  assert.equal(bancoPeloNome("Nubank (antigo Itaú)"), null);
  assert.equal(bancoPeloNome("Inter / Caixa"), null);
  assert.equal(bancoPeloNome("Sicredi Credinor"), null);
  assert.equal(bancoPeloNome("BTG 208 237"), null);
  assert.equal(bancoPeloNome("208 237"), null);
  assert.equal(bancoPeloNome("Sicoob 089"), null, "número fora da lista também contradiz");
  assert.equal(bancoPeloNome("Caixa Geral")?.codigo, "473", "o apelido maior fica com o trecho");
  assert.equal(bancoPeloNome("Caixa - LGP")?.codigo, "104");
});
test("número digitado que contradiz o nome, ou desconhecido, é apontado", () => {
  assert.match(conflitoDoCodigo("Sicoob Credinor", "765"), /indica 756/);
  assert.match(conflitoDoCodigo("Cooperativa Regional", "999"), /não está na lista/);
  assert.equal(conflitoDoCodigo("Sicoob Credinor", "756"), null);
  assert.equal(conflitoDoCodigo("Sicoob Credinor", ""), null);
});
