import test from "node:test";
import assert from "node:assert/strict";
import {
  tipoDaChave, chaveCanonica, chaveLegivel, conferirChave, crc16, pixCopiaECola, lerCodigo, limiteDaMensagem,
  textoDoCodigo, valorDoCodigo, txidDoCodigo, cpfValido, cnpjValido,
} from "./pix.js";

// Documentos de teste com dígito verificador válido (não são de ninguém).
const CNPJ = "11.222.333/0001-81";
const CPF = "529.982.247-25";

test("chave que não é chave não vira nada para copiar", () => {
  assert.equal(chaveCanonica("", "CNPJ"), "");
  assert.equal(chaveCanonica("12.345.678/0001-00", "CNPJ"), "", "CNPJ com dígito errado");
  assert.equal(chaveCanonica("fulano@", "E-mail"), "");
  assert.equal(chaveCanonica("1234", "Telefone"), "");
  assert.equal(conferirChave("abc", "CNPJ").aviso.length > 0, true);
});

test("o botão copia o formato que o Pix conhece", () => {
  assert.equal(chaveCanonica(CNPJ, "CNPJ"), "11222333000181");
  assert.equal(chaveCanonica(CPF, "CPF"), "52998224725");
  assert.equal(chaveCanonica("(38) 99876-5432", "Telefone"), "+5538998765432");
  assert.equal(chaveCanonica("38998765432", "Telefone"), "+5538998765432");
  assert.equal(chaveCanonica("5538998765432", "Telefone"), "+5538998765432");
  assert.equal(chaveCanonica("+55 38 99876-5432", "Telefone"), "+5538998765432");
  assert.equal(chaveCanonica("  Financeiro@Impresilk.COM.BR ", "E-mail"), "financeiro@impresilk.com.br");
  assert.equal(chaveCanonica("123E4567-E12B-12D1-A456-426655440000", "Aleatoria"), "123e4567-e12b-12d1-a456-426655440000");
  assert.equal(chaveLegivel("11222333000181", "CNPJ"), CNPJ);
  assert.equal(chaveLegivel("38998765432", "Telefone"), "(38) 99876-5432");
});

test("onze dígitos: o cadastro decide entre CPF e celular; sem ele, o dígito verificador", () => {
  assert.equal(tipoDaChave("38998765432", "Telefone"), "Telefone");
  assert.equal(tipoDaChave("52998224725", "CPF"), "CPF");
  assert.equal(tipoDaChave("52998224725"), "CPF");
  assert.equal(tipoDaChave("38998765432"), "Telefone");
  assert.equal(tipoDaChave("(38) 99876-5432"), "Telefone");
});

test("tipo cadastrado diferente do formato da chave gera aviso", () => {
  const a = conferirChave("123e4567-e12b-12d1-a456-426655440000", "CNPJ");
  assert.equal(a.tipo, "Aleatoria");
  assert.match(a.aviso, /chave aleatória.*cadastrada como CNPJ/);
  assert.equal(conferirChave(CNPJ, "CNPJ").aviso, "");
  assert.equal(conferirChave("financeiro@impresilk.com.br", "E-mail").aviso, "");
});

test("CRC do código confere com o exemplo do manual do Banco Central", () => {
  const exemplo = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***6304";
  assert.equal(crc16(exemplo), "1D3D");
  assert.equal(crc16("123456789"), "29B1", "vetor clássico do CRC-16/CCITT-FALSE");
});

test("o código gerado para a chave do manual é o do manual", () => {
  const r = pixCopiaECola({ chave: "123e4567-e12b-12d1-a456-426655440000", tipo: "Aleatoria", nome: "Fulano de Tal", cidade: "Brasília" });
  assert.equal(r.codigo, "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913FULANO DE TAL6008BRASILIA62070503***6304" + crc16("00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913FULANO DE TAL6008BRASILIA62070503***6304"));
  assert.equal(lerCodigo(r.codigo).valido, true);
});

test("com valor, mensagem e identificador; os campos leem de volta e o CRC fecha", () => {
  const r = pixCopiaECola({ chave: CNPJ, tipo: "CNPJ", nome: "Impresilk Comunicação Visual Ltda", cidade: "Montes Claros", valor: "1.234,50", txid: "OS 23.364", mensagem: "Sinal da O.S. 23364" });
  const { valido, campos } = lerCodigo(r.codigo);
  assert.equal(valido, true);
  assert.equal(campos["54"], "1234.50");
  assert.equal(campos["59"], "IMPRESILK COMUNICACAO VIS", "nome sem acento e no teto de 25");
  assert.equal(campos["60"], "MONTES CLAROS");
  assert.equal(lerCodigo(campos["62"]).campos["05"], "OS23364");
  const mai = lerCodigo(campos["26"] + "6304" + crc16(campos["26"] + "6304"));
  assert.equal(mai.campos["00"], "br.gov.bcb.pix");
  assert.equal(mai.campos["01"], "11222333000181");
  assert.equal(mai.campos["02"], "SINAL DA O S 23364");
});

test("valor inválido, sem nome ou sem cidade não geram código", () => {
  assert.match(pixCopiaECola({ chave: CNPJ, tipo: "CNPJ", nome: "X", cidade: "Y", valor: "-3" }).erro, /valor/i);
  assert.match(pixCopiaECola({ chave: CNPJ, tipo: "CNPJ", nome: "", cidade: "Y" }).erro, /nome/);
  assert.match(pixCopiaECola({ chave: CNPJ, tipo: "CNPJ", nome: "X", cidade: "" }).erro, /cidade/);
  assert.match(pixCopiaECola({ chave: "", tipo: "CNPJ", nome: "X", cidade: "Y" }).erro, /chave/);
  assert.equal(valorDoCodigo(""), "");
  assert.equal(valorDoCodigo("0"), null);
  assert.equal(valorDoCodigo(10), "10.00");
  assert.equal(valorDoCodigo("10,5"), "10.50");
  assert.equal(valorDoCodigo("10.50"), "10.50", "ponto como decimal não vira mil e cinquenta");
  assert.equal(valorDoCodigo("1.234"), "1234.00");
  assert.equal(valorDoCodigo("R$ 1.234,56"), "1234.56");
  assert.equal(valorDoCodigo("12abc"), null);
  assert.equal(valorDoCodigo("1,2,3"), null);
});

test("mensagem longa é cortada para o campo 26 não passar de 99", () => {
  const r = pixCopiaECola({ chave: "financeiro.contas.a.receber@impresilkcomunicacaovisual.com.br", tipo: "E-mail", nome: "Impresilk", cidade: "Montes Claros", mensagem: "x".repeat(200) });
  const { valido, campos } = lerCodigo(r.codigo);
  assert.equal(valido, true);
  assert.ok(campos["26"].length <= 99);
});

test("texto, identificador e documentos", () => {
  assert.equal(textoDoCodigo("  São João d'Aliança  ", 15), "SAO JOAO D ALIA");
  assert.equal(txidDoCodigo(""), "***");
  assert.equal(txidDoCodigo("pedido #12-3"), "pedido123");
  assert.equal(cpfValido(CPF), true); assert.equal(cpfValido("111.111.111-11"), false);
  assert.equal(cnpjValido(CNPJ), true); assert.equal(cnpjValido("11.111.111/1111-11"), false);
});

/* REVISÃO ADVERSARIAL DE 25/09/2026: cada caso abaixo foi reproduzido contra a
   primeira versão e fazia o botão copiar outra chave, ler outro valor ou
   derrubar a tela. */
test("CPF escrito com máscara nunca vira celular, e CPF com dígito errado não vira nada", () => {
  const a = conferirChave("529.982.247-25", "Telefone");
  assert.equal(a.tipo, "CPF"); assert.equal(a.chave, "52998224725"); assert.match(a.aviso, /formato de CPF.*cadastrada como celular/);
  assert.equal(chaveCanonica("529.982.247-24", "CPF"), "");
  assert.equal(chaveCanonica("52998224724", "CPF"), "");
  assert.equal(chaveCanonica("529.982.247-24", "CNPJ"), "");
  assert.equal(tipoDaChave("(38) 99870-0182", "CPF"), "Telefone");
  assert.equal(tipoDaChave("38 99870-0182", "CPF"), "Telefone");
  assert.match(conferirChave("(38) 99870-0182", "CPF").aviso, /celular.*cadastrada como CPF/);
  assert.ok(pixCopiaECola({ chave: "529.982.247-24", tipo: "CPF", nome: "X", cidade: "Y" }).erro);
});

test("CNPJ alfanumérico é CNPJ, e letras nunca são jogadas fora", () => {
  assert.equal(cnpjValido("12ABC34501DE35"), true, "exemplo do manual do Pix");
  assert.equal(tipoDaChave("12ABC34501DE35", "CNPJ"), "CNPJ");
  assert.equal(chaveCanonica("12.ABC.345/01DE-35", "CNPJ"), "12ABC34501DE35");
  assert.equal(chaveLegivel("12abc34501de35", "CNPJ"), "12.ABC.345/01DE-35");
  const c = conferirChave("319AB876C54347", "CNPJ");
  assert.notEqual(c.tipo, "Telefone"); assert.doesNotMatch(c.chave, /^\+/);
  assert.equal(tipoDaChave("12ABC34501DE36"), "", "dígito verificador errado");
  assert.equal(tipoDaChave("b6c0c81e-dfcc-413f-bed-3adc12345678"), "", "chave aleatória com um caractere a menos");
  assert.equal(pixCopiaECola({ chave: "12ABC34501DE35", tipo: "CNPJ", nome: "X", cidade: "Y" }).erro, undefined);
});

test("e-mail na regra do Pix: ASCII, até 77; invisível colado do WhatsApp sai", () => {
  const longo = "a".repeat(66) + "@impresilk.com"; // 80
  assert.equal(tipoDaChave(longo), "");
  assert.equal(tipoDaChave("joão@impresilk.com.br"), "");
  assert.equal(tipoDaChave("fulano@x.com."), "");
  const zw = String.fromCharCode(0x200b);
  assert.equal(chaveCanonica(zw + "Financeiro@Impresilk.com.br" + zw, "E-mail"), "financeiro@impresilk.com.br");
  // Nada disso derruba a tela: vira erro dito.
  const r = pixCopiaECola({ chave: "joão.silva@impresilk.com.br", tipo: "E-mail", nome: "X", cidade: "Y", mensagem: "m".repeat(60) });
  assert.ok(r.erro);
  const r77 = pixCopiaECola({ chave: "a".repeat(63) + "@impresilk.com", tipo: "E-mail", nome: "X", cidade: "Y", mensagem: "m".repeat(80) });
  assert.ok(r77.codigo && lerCodigo(r77.codigo).valido);
});

test("celular do Pix é +55 DDD 9 número: fixo, celular antigo e estrangeiro não passam", () => {
  assert.equal(tipoDaChave("(38) 9876-5432", "Telefone"), "", "sem o 9");
  assert.equal(tipoDaChave("+55 38 3221-1234", "Telefone"), "", "fixo");
  assert.equal(tipoDaChave("+44 20 7946 0958", "Telefone"), "");
  assert.equal(tipoDaChave("553832211234"), "");
  assert.match(conferirChave("(38) 9876-5432", "Telefone").aviso, /não tem o formato/);
});

test("valor: formas ambíguas são recusadas, não adivinhadas", () => {
  for (const v of ["1,250.00", "1.250.00", "10.5.00", "1.2.3", "1.23,45", "1.234.56", "1,250", "0,001", 0.001, "1,2,3", "12abc"]) {
    assert.equal(valorDoCodigo(v), null, String(v));
  }
  assert.equal(valorDoCodigo("12.345.678,90"), "12345678.90");
  assert.equal(valorDoCodigo("1250,00"), "1250.00");
  assert.equal(valorDoCodigo("1.250"), "1250.00");
  assert.equal(valorDoCodigo("10.50"), "10.50");
  assert.equal(valorDoCodigo(" R$ 99,9 "), "99.90");
});

test("mensagem: o teto depende da chave, o corte é na palavra e a tela fica sabendo", () => {
  const evp = "123e4567-e12b-12d1-a456-426655440000";
  assert.equal(limiteDaMensagem(evp, "Aleatoria"), 37);
  assert.equal(limiteDaMensagem("11.222.333/0001-81", "CNPJ"), 59);
  const r = pixCopiaECola({ chave: evp, tipo: "Aleatoria", nome: "Impresilk", cidade: "Montes Claros", mensagem: "Sinal O.S. 23364 - parcela 1 de 3 do painel" });
  assert.equal(r.mensagemNoCodigo, "SINAL O S 23364 PARCELA 1 DE 3 DO");
  assert.equal(r.mensagemCortada, true);
  assert.equal(lerCodigo(r.codigo).valido, true);
  assert.equal(pixCopiaECola({ chave: evp, tipo: "Aleatoria", nome: "X", cidade: "Y", mensagem: "Sinal" }).mensagemCortada, false);
});
test("valor sendo digitado ('1,') não some o código; valor inválido tem uma mensagem só", () => {
  assert.equal(valorDoCodigo("1,"), "1.00");
  assert.equal(valorDoCodigo("1.250,"), "1250.00");
  assert.match(pixCopiaECola({ chave: "11.222.333/0001-81", tipo: "CNPJ", nome: "X", cidade: "Y", valor: "0" }).erro, /^Valor inválido/);
});
