/* A parte PURA das senhas: a regra, a senha gerada e a decisao de quais lojas
 * de uma pessoa recebem a senha. Sem banco e sem rede; o mesmo carregador do
 * tests/arquivos-senha.test.mjs. Casos ruins primeiro.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

async function carregar(nome) {
  const { code } = await transform(await readFile(new URL(`../supabase/functions/_shared/${nome}.ts`, import.meta.url), "utf8"), { loader: "ts", format: "esm" });
  return import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
}
const regra = await carregar("senha-regra");
const lojasMod = await carregar("senha-lojas");
const { problemaDaSenha, gerarSenha, PALAVRAS, falhaDeCredencial, motivoSeguro, pedidoEmLote, senhaPedida } = regra;
const { lojasDaPessoa, linhasDoLog, alvoNoSistema, SO_LEITURA } = lojasMod;

// ------------------------------------------------------------------ a regra

test("regra: curta, longa em bytes, espaço nas pontas e igual à atual são recusadas", () => {
  assert.match(problemaDaSenha("12345"), /ao menos 6/);
  assert.match(problemaDaSenha("ééé"), /ao menos 6/, "conta letra, não byte: 3 letras com 6 bytes é curta");
  assert.match(problemaDaSenha("a".repeat(73)), /no máximo 72 caracteres\.$/);
  assert.match(problemaDaSenha("é".repeat(37)), /acento conta dobrado/, "37 letras, 74 bytes: o bcrypt cortaria");
  assert.match(problemaDaSenha(" abcdef"), /espaço/);
  assert.match(problemaDaSenha("abcdef\t"), /espaço/);
  assert.match(problemaDaSenha("abcdef", "abcdef"), /diferente da atual/);
  for (const nao of [undefined, null, 123456, ["abcdef"], { s: "abcdef" }]) assert.ok(problemaDaSenha(nao), String(nao));
});

test("regra: o que cabe passa, inclusive 72 bytes exatos e espaço no meio", () => {
  assert.equal(problemaDaSenha("abcdef"), null);
  assert.equal(problemaDaSenha("a".repeat(72)), null);
  assert.equal(problemaDaSenha("é".repeat(36)), null);
  assert.equal(problemaDaSenha("frase com espaço no meio"), null);
  assert.equal(problemaDaSenha("nova-senha", "senha-atual"), null);
});

test("senha pedida: veio fora da regra é recusada; não veio, é gerada; nunca aparada", () => {
  assert.ok("erro" in senhaPedida(" comeca-com-espaco"));
  assert.ok("erro" in senhaPedida("curta"));
  assert.equal(senhaPedida("  meio  ok  ".trim()).senha, "meio  ok");
  for (const vazio of [undefined, null, ""]) assert.match(senhaPedida(vazio).senha, /^([a-z]+-){4}\d{3}$/);
});

test("senha gerada: mil gerações, todas na regra, quatro palavras da lista e três dígitos", () => {
  const vistas = new Set();
  for (let i = 0; i < 1000; i++) {
    const s = gerarSenha();
    assert.equal(problemaDaSenha(s), null, s);
    const m = s.match(/^([a-z]+)-([a-z]+)-([a-z]+)-([a-z]+)-(\d{3})$/);
    assert.ok(m, s);
    for (const p of m.slice(1, 5)) assert.ok(PALAVRAS.includes(p), p);
    const n = Number(m[5]);
    assert.ok(n >= 100 && n <= 999);
    vistas.add(s);
  }
  assert.ok(vistas.size > 990, "sorteio de verdade, não repetição");
  assert.equal(PALAVRAS.length, 32);
  assert.equal(new Set(PALAVRAS).size, 32, "palavras repetidas baixariam a entropia");
});

test("erro do Auth: só é credencial errada quando o GoTrue respondeu 400 dizendo isso", () => {
  assert.equal(falhaDeCredencial({ status: 400, code: "invalid_credentials", message: "Invalid login credentials" }), true);
  assert.equal(falhaDeCredencial({ status: 400, message: "Invalid login credentials" }), true);
  for (const fora of [{ status: 0, message: "fetch failed" }, { status: 500, message: "x" }, { status: 429, message: "rate" },
    { status: 400, code: "email_not_confirmed", message: "Email not confirmed" }, null, undefined]) {
    assert.equal(falhaDeCredencial(fora), false, JSON.stringify(fora));
  }
});

test("motivo seguro: tira a senha e o hash, e corta em 200", () => {
  const hash = "0123456789abcdef".repeat(4);
  const m = motivoSeguro({ message: `Failing row contains (pcp, karen, ${hash}) com a senha segredo-1` }, ["segredo-1"]);
  assert.ok(!m.includes(hash));
  assert.ok(!m.includes("segredo-1"));
  assert.equal(motivoSeguro("x".repeat(500)).length, 200);
  assert.equal(motivoSeguro(""), "sem detalhe");
});

test("pedido de lote: lista, estrela, vírgula, `usuarios` e `todos` são lote; um usuário não é", () => {
  for (const c of [{ usuario: ["a"] }, { usuario: "*" }, { usuario: "a,b" }, { usuario: "a;b" }, { usuario: "a", usuarios: [] },
    { usuario: "a", todos: false }, { usuario: { x: 1 } }]) assert.equal(pedidoEmLote(c), true, JSON.stringify(c));
  for (const c of [{ usuario: "a" }, { usuario: "karen.luiza" }, {}]) assert.equal(pedidoEmLote(c), false, JSON.stringify(c));
});

// -------------------------------------------------------------- as lojas

const conta = (extra = {}) => ({ id: "c1", usuario: "karen", nome: "Karen", colaborador: "Karen Luiza", colaborador_id: "f1", auth_user_id: "E1", ...extra });
const papel = (sistema, extra = {}) => ({ conta_id: "c1", sistema, papel: "", permissoes: [], login: "", ativo: true, ...extra });

test("lojas: só-leitura e sistema desconhecido nunca viram loja gravada, e não somem da resposta", () => {
  const l = lojasDaPessoa({
    modo: "direcao", conta: conta(), painelConta: null, painelAlvo: "karen", perfis: [],
    papeis: ["dre", "central", "bosques", "domo", "inventado"].map((s) => papel(s)),
    equipe: [{ sistema: "dre", usuario: "karen" }, { sistema: "inventado", usuario: "karen" }],
  });
  assert.deepEqual(l.equipe, []);
  const por = Object.fromEntries(l.sistemas.map((s) => [s.sistema, s.resultado]));
  assert.deepEqual(por, { dre: "pela-entrada", central: "pela-entrada", bosques: "fora", domo: "fora", inventado: "fora" });
  for (const s of ["central", "dre", "bosques", "domo"]) assert.ok(SO_LEITURA.has(s));
});

test("lojas: conta que não existe no sistema fica de fora com o login que faltou; nunca se cria", () => {
  const l = lojasDaPessoa({
    modo: "direcao", conta: conta(), painelConta: null, painelAlvo: "karen", perfis: [],
    papeis: [papel("pcp"), papel("pops", { login: "karen.l" })], equipe: [{ sistema: "pcp", usuario: "karen" }],
  });
  assert.deepEqual(l.equipe, [{ sistema: "pcp", usuario: "karen" }]);
  const pops = l.sistemas.find((s) => s.sistema === "pops");
  assert.equal(pops.resultado, "sem-conta");
  assert.match(pops.motivo, /"karen\.l"/);
});

test("lojas: o login de cada sistema vem do apontamento, e a conta é casada sem acento nem maiúscula", () => {
  const l = lojasDaPessoa({
    modo: "direcao", conta: conta({ usuario: "leonardo" }), painelConta: null, painelAlvo: "leonardo", perfis: [],
    papeis: [papel("pcp", { login: "Leo" })],
    equipe: [{ sistema: "pcp", usuario: "leonardo" }, { sistema: "pcp", usuario: "leo" }],
  });
  assert.deepEqual(l.equipe, [{ sistema: "pcp", usuario: "leo" }], "o `leo` do PCP, não a sósia `leonardo`");
});

test("lojas: RH pela ficha, TODAS as identidades; a que é a própria entrada não é gravada duas vezes", () => {
  const perfis = [
    { user_id: "E1", usuario: "karen luiza", colaborador_id: "f1" },
    { user_id: "R2", usuario: "karen l", colaborador_id: "f1" },
    { user_id: "X9", usuario: "karen luiza", colaborador_id: "f-outra" },   // homônima de outra ficha
  ];
  const l = lojasDaPessoa({ modo: "direcao", conta: conta(), papeis: [papel("rh")], equipe: [], painelConta: null, painelAlvo: "karen", perfis });
  assert.deepEqual(l.rh.map((r) => r.userId), ["R2"], "E1 é a entrada; X9 é de outra ficha");
  assert.equal(l.sistemas.find((s) => s.sistema === "rh").resultado, "trocada");
  assert.equal(l.sistemas.find((s) => s.sistema === "rh").aviso, undefined);
});

test("lojas: sem ficha, o RH é achado pelo nome e a resposta avisa", () => {
  const l = lojasDaPessoa({
    modo: "direcao", conta: conta({ colaborador_id: null, colaborador: "Karen Luíza" }), papeis: [papel("rh")], equipe: [],
    painelConta: null, painelAlvo: "karen", perfis: [{ user_id: "R2", usuario: "karen luiza", colaborador_id: null }],
  });
  assert.deepEqual(l.rh.map((r) => r.userId), ["R2"]);
  assert.match(l.sistemas.find((s) => s.sistema === "rh").aviso, /pelo nome/);
});

test("lojas: papel no RH sem perfil é \"sem-conta\"", () => {
  const l = lojasDaPessoa({ modo: "direcao", conta: conta(), papeis: [papel("rh")], equipe: [], painelConta: null, painelAlvo: "karen", perfis: [] });
  assert.equal(l.sistemas.find((s) => s.sistema === "rh").resultado, "sem-conta");
  assert.deepEqual(l.rh, []);
});

test("lojas: o Painel só nasce para a direção na troca dela; para os outros, sem linha é sem conta", () => {
  const base = { conta: conta(), papeis: [papel("painel")], equipe: [], perfis: [], painelConta: null, painelAlvo: "karen" };
  assert.equal(lojasDaPessoa({ ...base, modo: "propria", ehDirecao: false }).painel, null);
  assert.equal(lojasDaPessoa({ ...base, modo: "direcao", ehDirecao: true }).painel, null, "(B) nunca cria");
  assert.deepEqual(lojasDaPessoa({ ...base, modo: "propria", ehDirecao: true, nomeDirecao: "Leo" }).painel,
    { usuario: "karen", criar: { nome: "Leo", permissoes: ["*"] } });
  assert.deepEqual(lojasDaPessoa({ ...base, modo: "direcao", painelConta: { usuario: "karen" } }).painel, { usuario: "karen" });
});

test("lojas: sem acesso_conta, só o Painel (nada de equipe, RH nem entrada)", () => {
  const l = lojasDaPessoa({ modo: "propria", conta: null, papeis: [papel("pcp")], equipe: [{ sistema: "pcp", usuario: "karen" }],
    painelConta: { usuario: "karen" }, painelAlvo: "karen", perfis: [{ user_id: "R2", usuario: "karen luiza", colaborador_id: "f1" }] });
  assert.equal(l.contaId, null);
  assert.deepEqual(l.equipe, []);
  assert.deepEqual(l.rh, []);
  assert.deepEqual(l.sistemas.map((s) => s.sistema), ["painel"]);
});

test("log: uma linha por loja alcançada, com o login daquele sistema, e nunca a senha", () => {
  const l = lojasDaPessoa({
    modo: "direcao", conta: conta(), papeis: [papel("painel"), papel("pcp", { login: "kaka" }), papel("rh"), papel("dre"), papel("pops")],
    equipe: [{ sistema: "pcp", usuario: "kaka" }], painelConta: { usuario: "karen" }, painelAlvo: "karen",
    perfis: [{ user_id: "E1", usuario: "karen luiza", colaborador_id: "f1" }],
  });
  const linhas = linhasDoLog(l, l.sistemas, { entrada: true, por: "painel:leonardo", detalhe: "definida pela direção, temporária" });
  assert.deepEqual(linhas.map((x) => [x.p_sistema, x.p_usuario]), [["*", "karen"], ["painel", "karen"], ["rh", "karen luiza"], ["pcp", "kaka"]]);
  assert.ok(linhas.every((x) => x.p_acao === "trocou-senha" && x.p_por === "painel:leonardo"));
});

test("a regra do login por sistema continua a mesma que a tela de Acessos usa", () => {
  assert.equal(alvoNoSistema(conta(), "rh"), "f1", "no RH a chave é a ficha");
  assert.equal(alvoNoSistema(conta({ colaborador_id: "" }), "rh"), "Karen Luiza");
  assert.equal(alvoNoSistema(conta(), "dre", { login: "outro" }), "karen", "no DRE vale o usuário do crachá");
  assert.equal(alvoNoSistema(conta(), "pcp", { login: "kaka" }), "kaka");
  assert.equal(alvoNoSistema(conta(), "pcp", {}), "karen");
});
