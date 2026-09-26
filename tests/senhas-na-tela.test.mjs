/* AS DUAS TROCAS DE SENHA, NA TELA DE VERDADE.
 *
 * (A) Minha conta: a pessoa troca a propria senha e ela vale em todos os
 *     sistemas dela.
 * (B) Cartao da pessoa: a direcao define UMA senha que vale em todos os
 *     sistemas daquela pessoa.
 *
 * Os componentes de verdade sao empacotados pelo esbuild (como os outros
 * testes da casa fazem com as functions) e renderizados em HTML, sem navegador.
 * O que se prende aqui e o que cada trava promete a quem olha:
 *   · antes de trocar, a tela diz ONDE a senha vai valer, e o aviso de que a
 *     senha atual para de valer em todos (inclusive RH e entrada pelo Painel);
 *   · as regras da senha aparecem antes de enviar;
 *   · a senha aparece UMA vez, grande, com copiar, e SEM o link do WhatsApp
 *     que punha a senha dentro de um endereco;
 *   · depois, onde valeu e onde nao, com o motivo;
 *   · o modo "Crie a sua senha" para quem entrou com senha provisoria.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

const ENTRADA = `
import React from "react";
import { renderToStaticMarkup } from "react-dom/server.browser";
import { MemoryRouter } from "react-router-dom";
import MinhaConta from "./components/central/MinhaConta.jsx";
import { JanelaDefinirSenha } from "./components/AcessoUnico.jsx";
import { ConteudoSenha, ResultadoSenhas } from "./components/AreaSistemas.jsx";
import { mancheteDaSenha, resultadoDaSenha } from "./lib/senha-previsao.mjs";
const html = (el) => renderToStaticMarkup(React.createElement(MemoryRouter, null, el));
export const minhaConta = (sessao) => html(React.createElement(MinhaConta, { sessao }));
export const definirSenha = (c) => html(React.createElement(JanelaDefinirSenha, { c, aoFechar: () => {} }));
export const senhaMostrada = (props) => html(React.createElement(ConteudoSenha, props));
export const depoisDeDefinir = (resposta, nome) => html(React.createElement(ConteudoSenha, {
  nome, senha: resposta.senha, login: "karen", provisoria: resposta.temporaria,
  manchete: mancheteDaSenha(resposta, { modo: "definir", nome }),
  itens: resultadoDaSenha(resposta, { modo: "definir" }),
  aoGuardar() {}, aoFechar() {}, aoVoltar() {},
}));
export const depoisDaMinha = (resposta, usuario) => html(React.createElement(ResultadoSenhas, {
  itens: resultadoDaSenha(resposta, { modo: "minha", usuario }), titulo: "Onde valeu",
}));
`;

let tela;
async function carregarTela() {
  if (tela) return tela;
  const saida = await build({
    stdin: { contents: ENTRADA, resolveDir: SRC, loader: "jsx", sourcefile: "entrada-teste.jsx" },
    bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "silent",
    jsx: "automatic", mainFields: ["module", "main"], conditions: ["browser", "import", "default"],
    loader: { ".css": "empty", ".png": "empty", ".ttf": "empty" },
    define: { "import.meta.env": '{"MODE":"test"}', "process.env.NODE_ENV": '"production"' },
  });
  tela = await import("data:text/javascript;base64," + Buffer.from(saida.outputFiles[0].text).toString("base64"));
  return tela;
}
// Tira as tags para comparar o texto que a pessoa le.
const texto = (h) => h.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ");

const DIRECAO = { usuario: "leonardo", nome: "Leonardo Pereira", master: true, permissoes: ["*"] };
const KAREN = {
  usuario: "karen", nome: "Karen Souza", tipo: "pessoa", ativo: true, colaborador: "Karen Souza", senhas: [],
  papeis: [
    { sistema: "painel", login: "karen", real: { existe: true, login: "karen", permissoes: ["orcamentos"] } },
    { sistema: "pcp", login: "karen", real: { existe: true, login: "karen" } },
    { sistema: "compras", login: "karen", real: { existe: true, login: "karen" } },
    { sistema: "pops", login: "karen.s", real: { existe: false } },
    { sistema: "dre", login: "karen" },
  ],
};

// ------------------------------------------------------------ (A) Minha conta

test("A: antes de trocar, a tela mostra as regras e onde a senha vai valer", async () => {
  const { minhaConta } = await carregarTela();
  const t = texto(minhaConta(DIRECAO));
  assert.match(t, /Trocar a minha senha em todos os sistemas/);
  for (const regra of ["6 caracteres ou mais", "até 72 caracteres", "sem espaço no começo nem no fim", "diferente da senha atual", "as duas iguais"]) {
    assert.ok(t.includes(regra), `falta a regra "${regra}"`);
  }
  assert.match(t, /Vai valer em/);
  // Sem a lista que a entrada unica grava no aparelho, a tela nao inventa:
  // diz a regra e que a lista exata vem depois da troca.
  assert.match(t, /No Painel e em todo sistema em que você tem conta\. A lista exata aparece depois da troca\./);
  assert.doesNotMatch(t, /: cumprida/, "com o campo vazio nenhuma regra aparece cumprida");
  assert.match(t, /Trocar em todos os sistemas/);
  assert.match(t, /usuário leonardo · Direção/);
});

test("A: a senha atual e pedida sempre, com o autocomplete certo em cada campo", async () => {
  const { minhaConta } = await carregarTela();
  const h = minhaConta(DIRECAO);
  assert.match(h, /id="mc-atual"[^>]*autoComplete="current-password"|autocomplete="current-password"[^>]*id="mc-atual"|id="mc-atual"[^>]*autocomplete="current-password"/i);
  assert.equal((h.match(/new-password/gi) || []).length, 2);
  assert.doesNotMatch(h, /value="[^"]+"[^>]*type="password"/, "campo de senha nasce vazio");
});

test("A: quem entrou com senha provisoria ve 'Crie a sua senha', sem abas", async () => {
  const { minhaConta } = await carregarTela();
  const h = minhaConta({ ...DIRECAO, trocarSenha: true });
  const t = texto(h);
  assert.match(t, /Crie a sua senha/);
  assert.match(t, /A senha que você recebeu é provisória/);
  assert.match(t, /Senha provisória \(a que você recebeu\)/);
  assert.match(t, /Salvar e continuar/);
  assert.doesNotMatch(h, /Seções de sistemas e configurações/, "sem a fileira de abas");
});

test("A: quem nao e direcao ve 'Minha conta' como titulo e nenhuma aba de direcao", async () => {
  const { minhaConta } = await carregarTela();
  const t = texto(minhaConta({ usuario: "karen", nome: "Karen", master: false, permissoes: ["orcamentos"] }));
  assert.match(t, /Minha conta/);
  assert.doesNotMatch(t, /Sistemas e configurações/);
  assert.doesNotMatch(t, /Visão geral|Backups/);
  assert.match(t, /Acesso da equipe/);
});

test("A: depois, onde valeu, onde nao e por que (login diferente dito)", async () => {
  const { depoisDaMinha } = await carregarTela();
  const t = texto(depoisDaMinha({
    ok: true, parcial: false, entrada: "trocada",
    sistemas: [
      { sistema: "painel", resultado: "trocada", login: "leonardo" },
      { sistema: "pcp", resultado: "trocada", login: "leo" },
      { sistema: "dre", resultado: "pela-entrada" },
      { sistema: "pops", resultado: "sem-conta", motivo: 'não existe conta "leonardo" ali' },
    ],
  }, "leonardo"));
  assert.match(t, /Onde valeu/);
  assert.match(t, /o seu login aqui é leo/);
  assert.match(t, /Pops & Fabricação .*sem conta/);
  assert.match(t, /DRE .*pela entrada/);
  assert.ok(t.indexOf("Pops") < t.indexOf("Entrada pelo Painel"), "o que ficou de fora vem primeiro");
});

// -------------------------------------------------------- (B) senha para todos

test("B: antes de definir, a janela diz onde vai valer e o aviso da senha atual", async () => {
  const { definirSenha } = await carregarTela();
  const t = texto(definirSenha(KAREN));
  assert.match(t, /Definir senha de Karen Souza/);
  assert.match(t, /Vai valer em/);
  assert.match(t, /Entrada pelo Painel .*abre os outros sistemas/);
  assert.match(t, /PCP .*login karen .*recebe/);
  assert.match(t, /Pops & Fabricação .*não tem conta "karen.s" lá .*não recebe/);
  assert.match(t, /DRE .*pela entrada/);
  // O aviso que era o confirm() de antes (trava 20), com o mesmo conteudo.
  assert.match(t, /A senha atual de Karen Souza para de valer em todos os sistemas, inclusive no RH e na entrada pelo Painel, que é a porta que a equipe usa\./);
  assert.match(t, /É provisória: ela vai ter de trocar ao entrar pelo Painel ou PCP\. No Compras a troca não é obrigatória\./);
  assert.match(t, /Gerar uma senha/);
  assert.match(t, /Eu escolho/);
  assert.match(t, /Definir senha/);
});

test("B: porta compartilhada recebe senha definitiva, e a janela diz", async () => {
  const { definirSenha } = await carregarTela();
  const t = texto(definirSenha({ ...KAREN, usuario: "expedicao", nome: "Expedição", tipo: "funcao" }));
  assert.match(t, /Porta compartilhada: a senha fica definitiva e ninguém é obrigado a trocar\./);
});

test("B: nenhuma janela de senha oferece trocar todos de uma vez", async () => {
  const { definirSenha } = await carregarTela();
  assert.doesNotMatch(texto(definirSenha(KAREN)), /todas as pessoas|todos de uma vez|em massa/i);
});

test("B: depois, a senha aparece UMA vez, grande, com copiar, e sem WhatsApp no endereco", async () => {
  const { depoisDeDefinir } = await carregarTela();
  const resposta = {
    ok: true, senha: "pedra-verde-chuva-folha-123", temporaria: true, parcial: true, entrada: "trocada",
    sistemas: [
      { sistema: "painel", resultado: "trocada", login: "karen", obriga: true },
      { sistema: "pcp", resultado: "trocada", login: "karen", obriga: true },
      { sistema: "compras", resultado: "trocada", login: "karen", obriga: false },
      { sistema: "rh", resultado: "falhou", motivo: "o RH não respondeu" },
      { sistema: "pops", resultado: "sem-conta", motivo: 'não existe conta "karen.s" ali' },
    ],
  };
  const h = depoisDeDefinir(resposta, "Karen Souza");
  const t = texto(h);
  assert.equal((h.match(/pedra-verde-chuva-folha-123/g) || []).length, 1, "a senha aparece uma vez so");
  assert.match(h, /select-all[^"]*text-2xl|text-2xl[^"]*select-all/, "grande e selecionavel");
  assert.match(t, /Copiar senha/);
  assert.doesNotMatch(h, /wa\.me|whatsapp/i, "a senha nao vai dentro de um endereco");
  assert.match(t, /Esta senha não aparece de novo/);
  assert.match(t, /É provisória: ela troca na próxima entrada/);
  assert.match(t, /Senha definida para Karen Souza em todos os sistemas, menos no RH\./);
  assert.match(t, /No RH continua a anterior: o RH não respondeu\./);
  assert.match(t, /PCP .*login karen · pede troca na entrada/);
  assert.match(t, /Compras .*não pede troca/);
  assert.match(t, /Já anotei, fechar/);
});

test("B: fechar sem copiar pergunta antes", async () => {
  const { senhaMostrada } = await carregarTela();
  const t = texto(senhaMostrada({
    nome: "Karen", senha: "abc-def", provisoria: true, confirmandoFechar: true,
    aoGuardar() {}, aoFechar() {}, aoVoltar() {},
  }));
  assert.match(t, /A senha não aparece de novo\. Fechar assim mesmo\?/);
  assert.match(t, /Fechar/);
  assert.match(t, /Voltar/);
  assert.doesNotMatch(t, /Já anotei, fechar/);
});
