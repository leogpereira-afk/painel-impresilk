/* A SENHA PROVISORIA OBRIGA NA ENTRADA PELO PAINEL (contrato das senhas, secao 5).
 *
 * O servidor devolve `trocarSenha: true` (acesso-entrar, painel-auth login) para
 * quem entrou com a senha que a direcao definiu. Ate a conferencia de 26/09 a
 * TELA jogava o campo fora: `entrar()` so guardava usuario, nome e permissoes,
 * `entradaUnica()` devolvia so o pedaco do Painel (o campo mora no topo da
 * resposta) e plantava os crachas dos outros sistemas assim mesmo. O modo "Crie
 * a sua senha" existia e nunca ligava, e a janela da direcao prometia "ela vai
 * ter de trocar ao entrar pelo Painel" sem ninguem obrigar.
 *
 * Aqui roda o codigo de verdade (lib/sessao.js e lib/entradaUnica.js), com a
 * rede e o localStorage trocados por falsos. Nada sai da maquina.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));

// localStorage falso, o mesmo para todos os testes (zerado em cada um).
const guardado = new Map();
globalThis.localStorage = {
  getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
  setItem: (k, v) => guardado.set(k, String(v)),
  removeItem: (k) => guardado.delete(k),
};
// A rede: cada teste diz o que o servidor responde; qualquer outra chamada falha.
let respostas = {};
const pedidos = [];
globalThis.fetch = async (url, op = {}) => {
  const corpo = JSON.parse(op.body || "{}");
  pedidos.push({ url: String(url), corpo });
  const nome = String(url).split("/").pop();
  const r = respostas[nome];
  if (!r) throw new TypeError("rede desligada no teste");
  return new Response(JSON.stringify(r.corpo), { status: r.status ?? 200 });
};

let mod;
async function carregar() {
  if (mod) return mod;
  const saida = await build({
    stdin: {
      contents: `export * from "./lib/sessao.js"; export { entradaUnica, meusSistemas } from "./lib/entradaUnica.js"; export { CHAVE_CRACHA } from "./lib/sistemas.js";`,
      resolveDir: SRC, loader: "js", sourcefile: "entrada-teste.js",
    },
    bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "silent",
    define: { "import.meta.env": '{"MODE":"test"}' },
  });
  mod = await import("data:text/javascript;base64," + Buffer.from(saida.outputFiles[0].text).toString("base64"));
  return mod;
}

const PAINEL = { token: "cracha-painel", usuario: "karen", nome: "Karen", permissoes: ["orcamentos"], master: false, vendedorId: "" };
const entradaCom = (trocarSenha) => ({
  "acesso-entrar": {
    corpo: {
      ok: true, usuario: "karen", nome: "Karen", trocarSenha,
      crachas: { painel: PAINEL, pcp: { token: "cracha-pcp" }, brief: { token: "cracha-brief" } },
      sistemas: ["painel", "pcp", "brief", "rh"],
    },
  },
});
const crachasPlantados = (CHAVE) =>
  Object.entries(CHAVE).filter(([s, k]) => s !== "painel" && guardado.has(k)).map(([s]) => s);

test("provisoria: a entrada unica NAO planta os crachas dos outros sistemas e tira os velhos", async () => {
  const { entradaUnica, meusSistemas, CHAVE_CRACHA } = await carregar();
  guardado.clear();
  // Um cracha velho do PCP neste aparelho (de uma sessao anterior) tambem sai:
  // senao a senha provisoria abriria o PCP pelo cracha de ontem.
  guardado.set(CHAVE_CRACHA.pcp, "cracha-velho");
  respostas = entradaCom(true);
  const r = await entradaUnica("karen", "provisoria-123");
  assert.equal(r?.token, "cracha-painel");
  assert.equal(r?.trocarSenha, true, "a marca chega a quem guarda a sessao");
  assert.deepEqual(crachasPlantados(CHAVE_CRACHA), [], "nenhum cracha de outro sistema no aparelho");
  // A LISTA (so nomes, nao abre nada) fica: e dela que Minha conta tira o
  // "Vai valer em" da tela "Crie a sua senha".
  assert.deepEqual(meusSistemas().sort(), ["brief", "pcp", "rh"]);
});

test("provisoria: login() guarda a marca na sessao, e ela sobrevive a recarregar", async () => {
  const { login, getSessao } = await carregar();
  guardado.clear();
  respostas = entradaCom(true);
  await login("karen", "provisoria-123");
  assert.equal(getSessao()?.trocarSenha, true);
  // Recarregar a pagina: a sessao sai do localStorage, e a marca junto.
  assert.equal(JSON.parse(guardado.get("painel_auth_sessao")).trocarSenha, true);
});

test("provisoria: a porta antiga (painel-auth) tambem obriga", async () => {
  const { login, getSessao } = await carregar();
  guardado.clear();
  respostas = {
    "acesso-entrar": { status: 401, corpo: { erro: "nao" } },
    "painel-auth": { corpo: { ...PAINEL, token: "cracha-antigo", trocarSenha: true } },
  };
  await login("karen", "provisoria-123");
  assert.equal(getSessao()?.trocarSenha, true);
});

test("senha definitiva: tudo como antes (crachas plantados, sem marca)", async () => {
  const { login, getSessao, meusSistemas, CHAVE_CRACHA } = await carregar();
  guardado.clear();
  respostas = entradaCom(false);
  await login("karen", "a-minha-senha");
  assert.notEqual(getSessao()?.trocarSenha, true);
  assert.deepEqual(crachasPlantados(CHAVE_CRACHA).sort(), ["brief", "pcp"]);
  assert.deepEqual(meusSistemas().sort(), ["brief", "pcp", "rh"]);
});

test("depois da troca: senhaTrocada tira a marca, com ou sem avisar a tela", async () => {
  const { login, getSessao, senhaTrocada, aoMudarSessao } = await carregar();
  guardado.clear();
  respostas = entradaCom(true);
  await login("karen", "provisoria-123");
  let avisos = 0;
  const parar = aoMudarSessao(() => { avisos += 1; });
  // Calado: a tela termina de mostrar "onde valeu", mas recarregar ja nao
  // prende a pessoa de novo (ela teria de escolher OUTRA senha).
  senhaTrocada({ avisarTela: false });
  assert.notEqual(getSessao()?.trocarSenha, true);
  assert.equal(avisos, 0);
  senhaTrocada();
  assert.equal(avisos, 1);
  parar();
});

test("a rota prende quem esta com senha provisoria em Minha conta", async () => {
  // O App inteiro nao roda sem navegador (store, rotas preguicosas); aqui se
  // prende o desenho: com a marca, so /minha-conta existe, e o resto volta para ela.
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const ramo = app.slice(app.indexOf("sessao.trocarSenha === true"));
  assert.ok(app.includes("sessao.trocarSenha === true"), "App.jsx nao olha a marca");
  const ate = ramo.indexOf("</Layout>");
  const bloco = ramo.slice(0, ate);
  assert.match(bloco, /path="\/minha-conta" element=\{<Acessos minhaConta \/>\}/);
  assert.match(bloco, /path="\*" element=\{<Navigate to="\/minha-conta" replace \/>\}/);
  assert.equal((bloco.match(/<Route /g) || []).length, 2, "com a marca, nenhuma outra rota abre");
});

// A troca da minha senha (Minha conta) separa "outra troca em andamento" (409)
// e "tente de novo" (503) de erro de verdade pelo STATUS, e nao so pela frase.
// `chamarAuth` jogava o status fora.
test("Minha conta: o erro do painel-auth chega com o status", async () => {
  const { chamarAuth } = await carregar();
  guardado.clear();
  for (const status of [409, 503, 401]) {
    respostas = { "painel-auth": { status, corpo: { erro: `erro ${status}` } } };
    await assert.rejects(chamarAuth("trocarMinhaSenha", { senhaAtual: "a", novaSenha: "b" }),
      (e) => e.status === status && e.message === `erro ${status}`);
  }
});
