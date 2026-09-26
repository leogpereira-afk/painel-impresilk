/* ONDE A SENHA VAI VALER E ONDE VALEU.
 *
 * "Vai valer em" (antes) sai dos papeis da pessoa; "Onde valeu" (depois) sai
 * da resposta do servidor (contrato das senhas, secoes 3 e 4). Os casos ruins
 * primeiro: sistema so-leitura, conta que nao existe, porta de funcao, pessoa
 * sem papel, e resposta que nao pode sumir nem contar duas vezes.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  previsaoDaSenha, resultadoDaSenha, mancheteDaSenha, avisoDeTroca, quantosReceberam, provisoriaNoSistema,
} from "../src/lib/senha-previsao.mjs";

const existe = (sistema, login = "karen") => ({ sistema, login, real: { existe: true, login } });
const fantasma = (sistema, login = "karen") => ({ sistema, login, real: { existe: false } });

test("previsao: so-leitura nao recebe senha (Central e DRE abrem pela entrada)", () => {
  const itens = previsaoDaSenha({ papeis: [existe("central"), existe("dre"), existe("pcp")] });
  const por = Object.fromEntries(itens.map((i) => [i.sistema, i]));
  assert.equal(itens[0].sistema, "entrada", "a entrada vem sempre primeiro");
  assert.equal(por.central.selo, "pela entrada");
  assert.equal(por.dre.selo, "pela entrada");
  assert.equal(por.pcp.selo, "recebe");
});

test("previsao: conta que nao existe la aparece como 'nao recebe', com o login", () => {
  const [, pcp] = previsaoDaSenha({ papeis: [fantasma("pcp", "leo")] });
  assert.equal(pcp.tom, "warn");
  assert.equal(pcp.selo, "não recebe");
  assert.match(pcp.detalhe, /"leo"/);
});

test("previsao: pessoa sem papel so tem a entrada; Domo e Bosques ficam fora", () => {
  assert.deepEqual(previsaoDaSenha({ papeis: [] }).map((i) => i.sistema), ["entrada"]);
  const [, domo] = previsaoDaSenha({ papeis: [existe("domo")] });
  assert.equal(domo.selo, "fora do Painel");
});

test("aviso da troca obrigatoria: porta de funcao e definitiva; Compras e RH nao obrigam", () => {
  assert.match(avisoDeTroca({ tipo: "funcao", papeis: [existe("pops")] }), /Porta compartilhada: a senha fica definitiva/);
  const t = avisoDeTroca({ tipo: "pessoa", papeis: [existe("painel"), existe("pcp"), existe("compras"), existe("rh"), fantasma("pops")] });
  assert.match(t, /trocar ao entrar pelo Painel ou PCP\./);
  assert.match(t, /No Compras e no RH a troca não é obrigatória/);
  assert.doesNotMatch(t, /Pops/, "sistema sem conta la nao pede troca");
});

/* O TESTE DE ANTES FIXAVA O BURACO: a pessoa dele nao tinha Painel, e a frase
   esperada era "ao entrar pelo Painel ou PCP". Sem conta no Painel a entrada
   unica nao emite o cracha dele, e ela nunca passa por ali. */
test("aviso da troca: 'pelo Painel' so para quem entra no Painel", () => {
  const semPainel = avisoDeTroca({ tipo: "pessoa", papeis: [existe("pcp"), existe("compras")] });
  assert.match(semPainel, /trocar ao entrar pelo PCP\./);
  assert.doesNotMatch(semPainel, /Painel/);
  const painelFantasma = avisoDeTroca({ tipo: "pessoa", papeis: [fantasma("painel"), existe("pcp")] });
  assert.doesNotMatch(painelFantasma, /Painel/, "Painel marcado e sem conta la nao abre");
  // Nenhum sistema que obrigue: a frase nao termina em "ao entrar pelo ."
  const nenhum = avisoDeTroca({ tipo: "pessoa", papeis: [existe("compras"), existe("rh")] });
  assert.doesNotMatch(nenhum, /pelo \./);
  assert.match(nenhum, /nenhum sistema dela obriga a troca/);
  assert.match(nenhum, /No Compras e no RH a troca não é obrigatória/);
});

const RESPOSTA_B = {
  ok: true, senha: "x", temporaria: true, parcial: true, entrada: "trocada",
  sistemas: [
    { sistema: "painel", resultado: "trocada", login: "karen", obriga: true },
    { sistema: "pcp", resultado: "trocada", login: "karen", obriga: true },
    { sistema: "rh", resultado: "falhou", motivo: "GoTrue fora" },
    { sistema: "dre", resultado: "pela-entrada" },
    { sistema: "pops", resultado: "sem-conta", motivo: 'não existe conta "karen" ali' },
    { sistema: "bosques", resultado: "fora", motivo: "senha própria, fora do Painel" },
  ],
  // O formato antigo vem junto (para a tela velha presa numa aba): NAO pode
  // contar de novo.
  trocados: ["entrada", "painel", "pcp"],
  recusados: [{ sistema: "pops", erro: "x" }, { sistema: "rh", erro: "y" }],
};

test("resultado: a ordem pede acao primeiro, e nada conta duas vezes", () => {
  const itens = resultadoDaSenha(RESPOSTA_B, { modo: "definir" });
  assert.deepEqual(itens.map((i) => i.sistema), ["rh", "pops", "entrada", "painel", "pcp", "dre", "bosques"]);
  assert.equal(itens.find((i) => i.sistema === "pcp").detalhe, "login karen · pede troca na entrada");
  assert.match(itens.find((i) => i.sistema === "rh").detalhe, /Continua a senha anterior/);
  assert.match(itens.find((i) => i.sistema === "pops").detalhe, /Resolva na linha do sistema/);
  assert.equal(quantosReceberam(RESPOSTA_B), 2);
});

test("resultado da minha senha: login diferente e dito", () => {
  const itens = resultadoDaSenha({ entrada: "trocada", sistemas: [{ sistema: "pcp", resultado: "trocada", login: "leo" }] },
    { modo: "minha", usuario: "leonardo" });
  const pcp = itens.find((i) => i.sistema === "pcp");
  assert.equal(pcp.selo, "trocada");
  assert.equal(pcp.destaque, "o seu login aqui é leo");
});

test("resultado: sistema que o registro nao conhece aparece com o proprio nome", () => {
  const itens = resultadoDaSenha({ sistemas: [{ sistema: "novo-sistema", resultado: "falhou", motivo: "m" }] });
  assert.equal(itens[0].nome, "novo-sistema");
});

// O servidor (senha-lojas.ts) manda `aviso` quando achou o RH pelo NOME, sem
// ficha ligada. A tela jogava fora: valeu, mas a ligacao fraca sumia calada.
test("resultado: o aviso do servidor (RH achado pelo nome) aparece na linha", () => {
  const aviso = "achado pelo nome: a conta não está ligada a uma ficha do RH";
  for (const modo of ["definir", "minha"]) {
    const [rh] = resultadoDaSenha({ sistemas: [{ sistema: "rh", resultado: "trocada", aviso }] }, { modo });
    assert.match(rh.detalhe, /achado pelo nome/, modo);
  }
});

test("manchete: parcial diz o RH e o motivo; sem-conta conta quantos ficaram de fora", () => {
  const m = mancheteDaSenha(RESPOSTA_B, { modo: "definir", nome: "Karen" });
  assert.equal(m.tom, "aviso");
  assert.equal(m.texto, "Senha definida para Karen em todos os sistemas, menos no RH.");
  assert.equal(m.segunda, "No RH continua a anterior: GoTrue fora.");
  const s = mancheteDaSenha({ sistemas: [{ sistema: "pops", resultado: "sem-conta" }, { sistema: "pcp", resultado: "trocada" }] }, { modo: "minha" });
  assert.equal(s.texto, "Senha trocada. 1 sistema ficou de fora: veja abaixo.");
  const ok = mancheteDaSenha({ entrada: "trocada", sistemas: [{ sistema: "pcp", resultado: "trocada" }] }, { modo: "minha" });
  assert.equal(ok.tom, "ok");
});

test("manchete: servidor antigo (so 'ok') nao vira 'em todos os sistemas'", () => {
  const m = mancheteDaSenha({ ok: true }, { modo: "minha" });
  assert.doesNotMatch(m.texto, /todos os sistemas/);
  assert.match(mancheteDaSenha({ senha: "x" }, { modo: "definir", nome: "Ana" }).texto, /^Senha definida para Ana\.$/);
});

test("minha senha sem entrada unica: a manchete nao promete todos", () => {
  const m = mancheteDaSenha({ entrada: "nao-consolidada", sistemas: [{ sistema: "painel", resultado: "trocada" }] }, { modo: "minha" });
  assert.equal(m.tom, "aviso");
  assert.match(m.texto, /entrada única não foi alcançada/);
});

test("senha de um sistema so: provisoria so onde o sistema obriga a troca", () => {
  assert.deepEqual(["brief", "pcp", "compras", "pops", "vof", "painel", "rh"].map(provisoriaNoSistema),
    [true, true, true, true, true, false, false]);
});
