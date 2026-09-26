/* (B) DEFINIR UMA SENHA PARA ESTA PESSOA EM TODOS OS SISTEMAS
 * (painel-acesso, definirSenha). So a direcao, uma pessoa por clique.
 *
 * A function roda inteira com banco e Auth falsos (tests/apoio-senha.mjs), e
 * a rede fica desligada: se ela tentasse chamar a equipe-auth (o caminho
 * antigo, que reenviava papel e modulos), o teste veria. Casos ruins primeiro.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { bancoFalso, carregar, cracha, tudoQueSaiu } from "./apoio-senha.mjs";

const ID = "c0000000-0000-4000-8000-0000000000b0";
const E = "e0000000-0000-4000-8000-0000000000b0";
const R = "f0000000-0000-4000-8000-0000000000b0";
const VELHO = { hash: "a".repeat(64), salt: "b".repeat(32), iter: 120000 };

const DIRECAO = cracha({ sub: "leonardo", nome: "Direção", master: true, perms: ["*"], vend: "" });
const CURINGA = cracha({ sub: "curinga", nome: "Acesso total", master: false, perms: ["*"], vend: "" });
// O crachá de um facilitador do V.O.F.: assinado com o segredo das EQUIPES, não o do Painel.
const FACILITADOR = cracha({ sis: "vof", sub: "facilitadora", nome: "Facilitadora", papel: "facilitador" }, "segredo-das-equipes-ficticio");

function estado({ tipo = "pessoa", ativo = true, papeis = ["painel", "pcp", "compras", "rh", "dre", "pops"], perfilId = E, auth = E } = {}) {
  return {
    acesso_conta: [
      { id: ID, usuario: "ficticia", nome: "Pessoa Fictícia", tipo, colaborador: "Pessoa Ficticia Completa", colaborador_id: "ficha-b",
        auth_user_id: auth, ativo, trocar_senha: false },
      { id: "c-dir", usuario: "leonardo", nome: "Direção", tipo: "pessoa", auth_user_id: null, ativo: true },
    ],
    // A TABELA DE INTENÇÃO DIVERGE DO SISTEMA de propósito: aqui ela diz
    // "acesso total" no Painel e "gestor" no PCP; lá a pessoa tem "orcamentos"
    // e "operador". Trocar a senha não pode mudar nada disso (achado 1).
    acesso_papel: papeis.map((sistema) => ({
      conta_id: ID, sistema, login: "", ativo: true, vendedor_id: "",
      papel: sistema === "pcp" ? "gestor" : "", permissoes: sistema === "painel" ? ["*", "gestao"] : [],
    })),
    equipe_contas: [
      { sistema: "pcp", usuario: "ficticia", nome: "Fictícia", papel: "operador", ativo: true, ...VELHO, trocar_senha: false },
      { sistema: "compras", usuario: "ficticia", nome: "Fictícia", papel: "comprador", ativo: true, ...VELHO, trocar_senha: false },
    ],
    painel_contas: [{ usuario: "ficticia", nome: "Fictícia", permissoes: ["orcamentos"], vendedor_id: "vend-1", ...VELHO }],
    perfis: perfilId ? [{ user_id: perfilId, usuario: "pessoa ficticia completa", colaborador_id: "ficha-b" }] : [],
    acesso_senha_legado: [{ conta_id: ID, origem: "equipe:pcp", ...VELHO, usado_em: null }, { conta_id: ID, origem: "painel", ...VELHO, usado_em: null }],
  };
}
const authBase = () => ({
  [E]: { email: "ficticia@impresilk.local", senha: "senha-anterior-ficticia" },
  [R]: { email: "pessoa.ficticia@rh.impresilk.local", senha: "senha-anterior-do-rh" },
});

async function montar({ est = estado(), auth = authBase(), falhas = {} } = {}) {
  const banco = bancoFalso({ estado: est, auth, falhas });
  const f = await carregar("painel-acesso", banco);
  return { banco, f };
}
const definir = (f, corpo = {}, token = DIRECAO) => f.chamar(token, { action: "definirSenha", usuario: "ficticia", ...corpo });
const rpcs = (banco, nome) => banco.ops.filter((o) => o.tipo === "rpc" && o.nome === nome);
const auths = (banco, acao) => banco.ops.filter((o) => o.tipo === "auth" && o.acao === acao);
const gravacoes = (banco) => rpcs(banco, "acesso_senha_gravar").length + auths(banco, "update").length;
const soRevogacao = (banco) => banco.ops.filter((o) => !(o.tipo === "rpc" && o.nome === "acesso_revogado"));

// ------------------------------------------------------------ os casos ruins

test("B1 crachá com acesso total mas sem ser a direção: 403 e zero operações", async () => {
  const { banco, f } = await montar();
  const r = await definir(f, {}, CURINGA);
  assert.equal(r.status, 403);
  assert.equal(banco.ops.length, 0);
});

test("B2 facilitador do V.O.F. (crachá das equipes) na porta da direção: 401 semSessao, zero operações", async () => {
  const { banco, f } = await montar();
  for (const token of [FACILITADOR, ""]) {
    const r = await definir(f, {}, token);
    assert.equal(r.status, 401);
    assert.equal(r.body.semSessao, true);
  }
  assert.equal(banco.ops.length, 0);
});

test("B2b crachá da direção revogado, ou banco sem dizer se vale: 401 e nada gravado", async () => {
  for (const falhas of [{ revogado: true }, { rpc: { acesso_revogado: { message: "fora do ar (simulado)" } } }]) {
    const { banco, f } = await montar({ falhas });
    const r = await definir(f);
    assert.equal(r.status, 401, JSON.stringify(falhas));
    assert.deepEqual(soRevogacao(banco), []);
  }
});

test("B3 lote em qualquer forma: 400 \"Uma pessoa por vez.\", zero operações", async () => {
  for (const corpo of [{ usuario: ["ficticia", "outra"] }, { usuario: "*" }, { usuario: "ficticia,outra" },
    { usuario: "ficticia", usuarios: ["outra"] }, { usuario: "ficticia", todos: true }, { usuario: { a: 1 } }]) {
    const { banco, f } = await montar();
    const r = await definir(f, corpo);
    assert.equal(r.status, 400, JSON.stringify(corpo));
    assert.equal(r.body.erro, "Uma pessoa por vez.");
    assert.deepEqual(soRevogacao(banco), [], "nem o freio é consultado");
  }
  for (const corpo of [{ usuario: "" }, { usuario: undefined }, { usuario: "Nome Com Espaço" }]) {
    const { f } = await montar();
    const r = await definir(f, corpo);
    assert.equal(r.status, 400);
    assert.equal(r.body.erro, "Escolha uma pessoa.");
  }
});

test("B4 a 11ª pessoa em 15 minutos para no freio de lote", async () => {
  const { banco, f } = await montar();
  for (let i = 0; i < 10; i++) assert.equal((await definir(f, { usuario: `ninguem${i}` })).status, 404);
  const r = await definir(f);
  assert.equal(r.status, 429);
  assert.match(r.body.erro, /Espere 15 minutos/);
  assert.equal(rpcs(banco, "porta_travada")[0].args.p_sistema, "definir-senha");
  assert.equal(rpcs(banco, "porta_travada")[0].args.p_usuario, "leonardo", "o balde é da direção");
  assert.equal(gravacoes(banco), 0);
});

test("B5 a própria direção, pessoa desativada e pessoa sem papel: recusa, sem gravar nada", async () => {
  {
    const { banco, f } = await montar();
    const r = await definir(f, { usuario: "leonardo" });
    assert.equal(r.status, 400);
    assert.match(r.body.erro, /Minha conta/);
    assert.equal(gravacoes(banco), 0);
  }
  {
    const { banco, f } = await montar({ est: estado({ ativo: false }) });
    const r = await definir(f);
    assert.equal(r.status, 409);
    assert.match(r.body.erro, /desativada/);
    assert.equal(gravacoes(banco), 0);
  }
  {
    const { banco, f } = await montar({ est: estado({ papeis: [] }) });
    const r = await definir(f);
    assert.equal(r.status, 409);
    assert.match(r.body.erro, /não tem acesso a nenhum sistema/);
    assert.equal(gravacoes(banco), 0);
  }
  {
    const { banco, f } = await montar();
    const r = await definir(f, { usuario: "naoexiste" });
    assert.equal(r.status, 404);
    assert.equal(gravacoes(banco), 0);
  }
});

test("B6 senha digitada fora da regra: 400, nada aparado", async () => {
  for (const senha of ["12345", " comeca-com-espaco", "termina-com-espaco ", "x".repeat(73), 123456]) {
    const { banco, f } = await montar();
    const r = await definir(f, { senha });
    assert.equal(r.status, 400, String(senha));
    assert.equal(rpcs(banco, "porta_travada").length, 0);
    assert.equal(gravacoes(banco), 0);
  }
});

test("B7 o banco recusa (a conta sumiu entre a leitura e a gravação): 500 \"nada mudou\", Auth intocado, sem senha", async () => {
  const digitada = "senha-escolhida-pela-direcao";
  const { banco, f } = await montar({ falhas: { antesDeGravar: (t) => { t.equipe_contas = t.equipe_contas.filter((l) => l.sistema !== "compras"); } } });
  const r = await definir(f, { senha: digitada });
  assert.equal(r.status, 500);
  assert.match(r.body.erro, /^Nada mudou: não consegui gravar/);
  assert.match(r.body.erro, /não existe a conta ficticia no compras/);
  assert.equal(auths(banco, "update").length, 0, "o Auth não é chamado");
  assert.ok(!("senha" in r.body));
  assert.ok(!r.texto.includes(digitada));
  assert.equal(banco.tabelas.equipe_contas.find((l) => l.sistema === "pcp").hash, VELHO.hash, "tudo ou nada");
  assert.ok(banco.tabelas.equipe_acessos_log.some((l) => l.acao === "senha-nao-definida" && l.sistema === "*"));
  assert.equal(banco.tabelas.painel_senha_operacao.length, 0, "a reserva é liberada");
});

test("B8 a entrada única recusa depois do banco: o banco é desfeito com o `antes`, e nada mudou", async () => {
  const digitada = "senha-escolhida-pela-direcao";
  const { banco, f } = await montar({ falhas: { update: new Set([E]) } });
  const r = await definir(f, { senha: digitada });
  assert.equal(r.status, 500);
  assert.match(r.body.erro, /^Nada mudou: a entrada pelo Painel recusou/);
  assert.ok(!r.texto.includes(digitada));
  const [repor] = rpcs(banco, "acesso_senha_repor");
  assert.ok(repor, "acesso_senha_repor foi chamado");
  assert.equal(repor.args.p_antes.equipe.length, 2);
  assert.equal(banco.tabelas.equipe_contas.find((l) => l.sistema === "pcp").hash, VELHO.hash, "voltou ao antes");
  assert.deepEqual(banco.tabelas.acesso_senha_legado.map((l) => l.origem).sort(), ["equipe:pcp", "painel"]);
  assert.equal(banco.usuarios.get(E).senha, "senha-anterior-ficticia");
});

test("B8b a entrada recusa e desfazer também falha: a mensagem manda clicar de novo", async () => {
  const { banco, f } = await montar({ falhas: { update: new Set([E]), rpc: { acesso_senha_repor: { message: "fora do ar (simulado)" } } } });
  const r = await definir(f);
  assert.equal(r.status, 500);
  assert.match(r.body.erro, /Clique de novo/);
  assert.ok(!("senha" in r.body));
  assert.equal(rpcs(banco, "acesso_senha_repor").length, 1);
});

test("B9 o RH com identidade própria recusa no fim: 200 parcial, com a senha", async () => {
  const { banco, f } = await montar({ est: estado({ perfilId: R }), falhas: { update: new Set([R]) } });
  const r = await definir(f);
  assert.equal(r.status, 200);
  assert.equal(r.body.parcial, true);
  assert.ok(r.body.senha);
  const rh = r.body.sistemas.find((s) => s.sistema === "rh");
  assert.equal(rh.resultado, "falhou");
  assert.ok(rh.motivo);
  assert.equal(banco.usuarios.get(E).senha, r.body.senha, "a entrada já vale");
  assert.equal(banco.usuarios.get(R).senha, "senha-anterior-do-rh");
  assert.ok(r.body.recusados.some((x) => x.sistema === "rh"), "a tela antiga também vê");
});

test("B10 papel e módulos divergentes: só as colunas de senha são enviadas, e nada mais muda", async () => {
  const { banco, f } = await montar();
  const r = await definir(f);
  assert.equal(r.status, 200);
  const [g] = rpcs(banco, "acesso_senha_gravar");
  for (const item of g.args.p_equipe) assert.deepEqual(Object.keys(item).sort(), ["sistema", "usuario"]);
  assert.deepEqual(g.args.p_painel, { usuario: "ficticia" });
  assert.deepEqual(f.fetches, [], "nenhuma chamada à equipe-auth");
  const painel = banco.tabelas.painel_contas[0];
  assert.deepEqual(painel.permissoes, ["orcamentos"], "módulos do Painel intocados");
  assert.equal(painel.vendedor_id, "vend-1");
  assert.equal(banco.tabelas.equipe_contas.find((l) => l.sistema === "pcp").papel, "operador", "papel intocado");
  assert.equal(banco.tabelas.equipe_contas.find((l) => l.sistema === "compras").ativo, true);
});

test("B11 conta de função (porta compartilhada) recebe a senha definitiva", async () => {
  const { banco, f } = await montar({ est: estado({ tipo: "funcao" }) });
  const r = await definir(f);
  assert.equal(r.status, 200);
  assert.equal(r.body.temporaria, false);
  assert.equal(rpcs(banco, "acesso_senha_gravar")[0].args.p_temporaria, false);
  assert.ok(banco.tabelas.equipe_contas.every((l) => l.trocar_senha === false));
  assert.equal(banco.tabelas.acesso_conta[0].trocar_senha, false);
  assert.ok(r.body.sistemas.every((s) => s.obriga !== true));
  assert.ok(banco.tabelas.equipe_acessos_log.some((l) => l.detalhe === "definitiva, porta compartilhada"));
});

// ------------------------------------------------------------ o caminho bom

test("B12 sucesso: provisória, a senha aparece UMA vez, sem cache, sessões derrubadas, rastro com quem fez", async () => {
  const { banco, f } = await montar({ est: estado({ perfilId: R }) });
  const r = await definir(f);
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.temporaria, true);
  assert.equal(r.body.parcial, false);
  assert.equal(r.body.entrada, "trocada");
  assert.equal(r.headers.get("cache-control"), "no-store");
  const senha = r.body.senha;
  assert.equal(r.texto.split(senha).length - 1, 1, "a senha aparece uma vez na resposta");
  assert.equal(banco.usuarios.get(E).senha, senha);
  assert.equal(banco.usuarios.get(R).senha, senha, "o RH de identidade própria também");
  const pcp = banco.tabelas.equipe_contas.find((l) => l.sistema === "pcp");
  assert.equal(pcp.trocar_senha, true, "provisória nas contas");
  assert.equal(banco.tabelas.acesso_conta[0].trocar_senha, true, "e na pessoa");
  assert.deepEqual(banco.tabelas.acesso_senha_legado.map((l) => l.origem), ["direcao"], "a guarda vira UMA linha");
  const derrubadas = rpcs(banco, "derrubar_sessoes").map((o) => o.args.p_user).sort();
  assert.deepEqual(derrubadas, [E, R].sort());
  const saiu = tudoQueSaiu(banco, []);
  for (const segredo of [senha, pcp.hash, pcp.salt]) assert.ok(!saiu.includes(segredo), "o log não leva segredo");
  const log = banco.tabelas.equipe_acessos_log.filter((l) => l.acao === "trocou-senha");
  assert.ok(log.length >= 4);
  assert.ok(log.every((l) => l.por === "painel:leonardo" && l.detalhe === "definida pela direção, temporária"));
  const por = Object.fromEntries(r.body.sistemas.map((s) => [s.sistema, s]));
  assert.equal(por.painel.obriga, true);
  assert.equal(por.pcp.obriga, true);
  assert.equal(por.compras.obriga, false, "o Compras só avisa");
  assert.equal(por.rh.obriga, false, "o RH não tem marca");
  assert.equal(por.dre.resultado, "pela-entrada");
  assert.equal(por.dre.obriga, true);
  assert.equal(por.pops.resultado, "sem-conta");
  assert.equal(banco.tabelas.painel_senha_operacao.length, 0);
});

test("B12b senha gerada pelo servidor segue a regra e o formato; a digitada vai como veio", async () => {
  {
    const { f } = await montar();
    const r = await definir(f);
    assert.match(r.body.senha, /^([a-z]+-){4}\d{3}$/);
  }
  {
    const { banco, f } = await montar();
    const r = await definir(f, { senha: "Escolhida Com Espaço No Meio" });
    assert.equal(r.status, 200);
    assert.equal(r.body.senha, "Escolhida Com Espaço No Meio");
    assert.equal(banco.usuarios.get(E).senha, "Escolhida Com Espaço No Meio");
  }
});

// ---------------------------------------- senhaDoSistema (contrato, secao 5)

test("senha só do RH para quem tem a identidade compartilhada com a entrada: recusa e aponta o caminho", async () => {
  const { banco, f } = await montar();
  const r = await f.chamar(DIRECAO, { action: "senhaDoSistema", usuario: "ficticia", sistema: "rh" });
  assert.equal(r.status, 409);
  assert.match(r.body.erro, /Definir senha em todos os sistemas/);
  assert.deepEqual(f.fetches, []);
  assert.equal(gravacoes(banco), 0);
});

test("senha só de um sistema: a senha digitada segue a mesma regra", async () => {
  const { f } = await montar();
  const r = await f.chamar(DIRECAO, { action: "senhaDoSistema", usuario: "ficticia", sistema: "pcp", senha: " curta" });
  assert.equal(r.status, 400);
  assert.deepEqual(f.fetches, []);
});

// ------------------------------------------------- a guarda de lote na tela

test("B14 definirSenha( é chamado de um lugar só de src/, e o serviço manda uma pessoa só", async () => {
  const raiz = fileURLToPath(new URL("../src/", import.meta.url));
  const achados = [];
  async function varrer(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const caminho = `${dir}${e.name}`;
      if (e.isDirectory()) await varrer(`${caminho}/`);
      else if (/\.(jsx?|mjs)$/.test(e.name) && !caminho.endsWith("services/acesso.js")) {
        // Comentario nao conta: so chamada de verdade.
        const codigo = (await readFile(caminho, "utf8"))
          .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
        const n = (codigo.match(/\bdefinirSenha\(/g) ?? []).length;
        if (n) achados.push([caminho.slice(raiz.length), n]);
      }
    }
  }
  await varrer(raiz);
  assert.equal(achados.reduce((s, [, n]) => s + n, 0), 1, `chamadas: ${JSON.stringify(achados)}`);

  // O serviço de verdade, com a rede trocada por um gravador.
  const enviados = [];
  const stubs = {
    "../lib/sessao.js": "export const comCracha = async (url, o) => { globalThis.__enviados.push(JSON.parse(o.body)); return new Response(JSON.stringify({ ok: true }), { status: 200 }); }; export const mensagemDoStatus = () => 'erro';",
    "../lib/api.js": "export const API = 'https://api.invalid';",
    "../lib/sistemas.js": "export const sistemaNoPainel = () => true;",
  };
  globalThis.__enviados = enviados;
  const saida = await build({
    entryPoints: [fileURLToPath(new URL("../src/services/acesso.js", import.meta.url))],
    bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "silent",
    define: { "import.meta.env.MODE": '"test"' },
    plugins: [{ name: "stubs", setup(b) {
      b.onResolve({ filter: /^\.\.\/(lib|review)\// }, (a) => ({ path: a.path, namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubs[a.path] ?? "export {}", loader: "js" }));
    } }],
  });
  const servico = await import("data:text/javascript;base64," + Buffer.from(saida.outputFiles[0].text).toString("base64"));
  await servico.definirSenha("ficticia");
  await servico.definirSenha("ficticia", "senha-escolhida");
  assert.deepEqual(enviados, [
    { action: "definirSenha", usuario: "ficticia" },
    { action: "definirSenha", usuario: "ficticia", senha: "senha-escolhida" },
  ]);
  for (const ruim of [["a", "b"], "", "*", null, { usuario: "a" }]) {
    assert.throws(() => servico.definirSenha(ruim), /Escolha uma pessoa|Uma pessoa por vez/, JSON.stringify(ruim));
  }
  assert.equal(enviados.length, 2, "pedido de lote não sai do navegador");
});

// ------------------------------- loja que também é de outra pessoa (revisão)

const E_DIR = "e0000000-0000-4000-8000-0000000000dd";

test("B15 login da pessoa apontado para a conta da direção: a senha da direção não muda", async () => {
  const est = estado();
  const dir = est.acesso_conta.find((c) => c.id === "c-dir");
  Object.assign(dir, { auth_user_id: E_DIR, colaborador_id: "ficha-dir" });
  est.acesso_papel.push({ conta_id: "c-dir", sistema: "pcp", papel: "admin", permissoes: [], login: "leo", ativo: true });
  est.acesso_papel.find((p) => p.conta_id === ID && p.sistema === "pcp").login = "leo";          // vínculo errado
  est.acesso_papel.find((p) => p.conta_id === ID && p.sistema === "painel").login = "leonardo";  // outro vínculo errado
  est.equipe_contas.push({ sistema: "pcp", usuario: "leo", nome: "Leo", papel: "admin", ativo: true, ...VELHO, trocar_senha: false });
  est.painel_contas.push({ usuario: "leonardo", nome: "Direção", permissoes: ["*"], vendedor_id: "", ...VELHO });
  const { banco, f } = await montar({ est });
  const r = await definir(f);
  assert.equal(r.status, 200);
  const [g] = rpcs(banco, "acesso_senha_gravar");
  assert.ok(!g.args.p_equipe.some((x) => x.usuario === "leo"));
  assert.equal(g.args.p_painel, null, "o Painel da direção não vai para o banco");
  assert.equal(banco.tabelas.equipe_contas.find((l) => l.usuario === "leo").hash, VELHO.hash);
  assert.equal(banco.tabelas.painel_contas.find((l) => l.usuario === "leonardo").hash, VELHO.hash);
  for (const s of ["pcp", "painel"]) {
    const item = r.body.sistemas.find((x) => x.sistema === s);
    assert.equal(item.resultado, "sem-conta", s);
    assert.match(item.motivo, /também é de/, s);
  }
});

test("B16 sem conta da direção no quadro, o login com o nome dela continua protegido", async () => {
  const est = estado();
  est.acesso_conta = est.acesso_conta.filter((c) => c.id !== "c-dir");
  est.acesso_papel.find((p) => p.conta_id === ID && p.sistema === "painel").login = "leonardo";
  est.painel_contas.push({ usuario: "leonardo", nome: "Direção", permissoes: ["*"], vendedor_id: "", ...VELHO });
  const { banco, f } = await montar({ est });
  const r = await definir(f);
  assert.equal(r.status, 200);
  assert.equal(banco.tabelas.painel_contas.find((l) => l.usuario === "leonardo").hash, VELHO.hash);
  assert.match(r.body.sistemas.find((x) => x.sistema === "painel").motivo, /também é de Direção/);
});

test("B17 entrada da pessoa é a mesma da direção (ou a identidade do RH dela): 409, nada gravado", async () => {
  {
    const est = estado();
    est.acesso_conta.find((c) => c.id === "c-dir").auth_user_id = E;
    const { banco, f } = await montar({ est });
    const r = await definir(f);
    assert.equal(r.status, 409);
    assert.match(r.body.erro, /^Nada mudou: a entrada desta pessoa é a mesma de Direção/);
    assert.equal(gravacoes(banco), 0);
    assert.ok(!("senha" in r.body));
  }
  {
    // A ficha do RH da pessoa é a mesma de outra conta: o RH fica de fora, o resto vale.
    const est = estado({ perfilId: R });
    Object.assign(est.acesso_conta.find((c) => c.id === "c-dir"), { colaborador_id: "ficha-b" });
    const { banco, f } = await montar({ est });
    const r = await definir(f);
    assert.equal(r.status, 200);
    assert.equal(banco.usuarios.get(R).senha, "senha-anterior-do-rh");
    assert.match(r.body.sistemas.find((x) => x.sistema === "rh").motivo, /também está ligada a Direção/);
  }
});

test("B18 entrada sem resposta ao gravar: pergunta ao Auth antes de desfazer", async () => {
  {
    // Gravou e a resposta se perdeu: a senha nova abre, então vale (e a senha volta).
    const { banco, f } = await montar({ falhas: { updateSumiu: (id, n) => id === E && n === 1 } });
    const r = await definir(f);
    assert.equal(r.status, 200);
    assert.ok(r.body.senha);
    assert.equal(banco.usuarios.get(E).senha, r.body.senha);
    assert.equal(rpcs(banco, "acesso_senha_repor").length, 0, "nada é desfeito");
    assert.ok(rpcs(banco, "derrubar_sessoes").some((o) => o.args.p_user === E), "a sessão da pergunta também cai");
  }
  {
    // Não gravou (503): a pergunta diz que não abre, e aí sim "nada mudou".
    const { banco, f } = await montar({ falhas: { updateFora: new Set([E]) } });
    const r = await definir(f);
    assert.equal(r.status, 500);
    assert.match(r.body.erro, /^Nada mudou/);
    assert.equal(rpcs(banco, "acesso_senha_repor").length, 1);
    assert.equal(banco.usuarios.get(E).senha, "senha-anterior-ficticia");
  }
  {
    // Nem a pergunta responde: desfaz, e a mensagem não promete "nada mudou".
    const { banco, f } = await montar({ falhas: { updateFora: new Set([E]), signIn: "fora" } });
    const r = await definir(f);
    assert.equal(r.status, 500);
    assert.doesNotMatch(r.body.erro, /^Nada mudou/);
    assert.match(r.body.erro, /Não consegui confirmar.*Clique de novo/);
    assert.ok(!("senha" in r.body));
    assert.equal(rpcs(banco, "acesso_senha_repor").length, 1);
  }
});

// ------------------- senhaDoSistema: as mesmas portas fechadas (revisão)

const doSistema = (f, corpo = {}) => f.chamar(DIRECAO, { action: "senhaDoSistema", usuario: "ficticia", sistema: "pcp", ...corpo });

test("senha só de um sistema: nem a própria direção, nem pessoa desativada", async () => {
  {
    const est = estado();
    est.acesso_papel.push({ conta_id: "c-dir", sistema: "pcp", papel: "admin", permissoes: [], login: "", ativo: true });
    est.equipe_contas.push({ sistema: "pcp", usuario: "leonardo", nome: "Direção", papel: "admin", ativo: true, ...VELHO, trocar_senha: false });
    const { f } = await montar({ est });
    const r = await doSistema(f, { usuario: "leonardo" });
    assert.equal(r.status, 400);
    assert.match(r.body.erro, /Minha conta/);
    assert.deepEqual(f.fetches, [], "a senha da direção não sai na tela");
  }
  {
    const { f } = await montar({ est: estado({ ativo: false }) });
    const r = await doSistema(f);
    assert.equal(r.status, 409);
    assert.match(r.body.erro, /desativada/);
    assert.deepEqual(f.fetches, []);
  }
});

test("senha só de um sistema: login que também é de outra pessoa é recusado", async () => {
  const est = estado();
  est.acesso_papel.push({ conta_id: "c-dir", sistema: "pcp", papel: "admin", permissoes: [], login: "leo", ativo: true });
  est.acesso_papel.find((p) => p.conta_id === ID && p.sistema === "pcp").login = "leo";
  est.equipe_contas.push({ sistema: "pcp", usuario: "leo", nome: "Leo", papel: "admin", ativo: true, ...VELHO, trocar_senha: false });
  const { f } = await montar({ est });
  const r = await doSistema(f);
  assert.equal(r.status, 409);
  assert.match(r.body.erro, /também é de Direção/);
  assert.deepEqual(f.fetches, []);
});

test("senha só de um sistema: o freio de lote é o mesmo do Definir senha", async () => {
  const { banco, f } = await montar();
  for (let i = 0; i < 10; i++) await doSistema(f);   // a rede está desligada: cada uma gasta a ficha e falha depois
  const r = await doSistema(f);
  assert.equal(r.status, 429);
  const fichas = rpcs(banco, "porta_travada");
  assert.ok(fichas.every((o) => o.args.p_sistema === "definir-senha" && o.args.p_usuario === "leonardo"));
  assert.equal(f.fetches.length, 10, "a 11ª não chega à equipe-auth");
});

test("senha só de um sistema: porta compartilhada recebe a definitiva", async () => {
  {
    const { f } = await montar({ est: estado({ tipo: "funcao" }) });
    await doSistema(f);
    assert.equal(f.corpos[0].temporaria, false);
  }
  {
    const { f } = await montar();
    await doSistema(f);
    assert.equal(f.corpos[0].temporaria, true);
  }
});

test("criar pessoa: senha fora da regra não apaga o cadastro pela metade; porta compartilhada nasce definitiva", async () => {
  {
    const est = estado({ papeis: [] });   // cadastro pela metade: conta sem papel nenhum
    const { banco, f } = await montar({ est });
    const r = await f.chamar(DIRECAO, { action: "criarPessoa", conta: { usuario: "ficticia", nome: "Pessoa" }, papeis: [], senha: "12345" });
    assert.equal(r.status, 400);
    assert.ok(banco.tabelas.acesso_conta.some((c) => c.id === ID), "a linha que já existia continua lá");
  }
  {
    const { f } = await montar({ est: { acesso_conta: [] } });
    await f.chamar(DIRECAO, { action: "criarPessoa", conta: { usuario: "expedicao", nome: "Expedição", tipo: "funcao" }, papeis: [{ sistema: "pcp", papel: "operador" }] });
    assert.equal(f.corpos[0].temporaria, false);
  }
});

test("B19 RH sem resposta ao gravar, mas a nova abre: não sai como falha", async () => {
  const { banco, f } = await montar({ est: estado({ perfilId: R }), falhas: { updateSumiu: new Set([R]) } });
  const r = await definir(f);
  assert.equal(r.status, 200);
  assert.equal(r.body.parcial, false);
  assert.equal(r.body.sistemas.find((s) => s.sistema === "rh").resultado, "trocada");
  assert.equal(banco.usuarios.get(R).senha, r.body.senha);
  assert.ok(rpcs(banco, "derrubar_sessoes").some((o) => o.args.p_user === R));
});

test("criar pessoa por cima de conta sem papel: só o cadastro pela metade; desativada, migrada ou a direção, não", async () => {
  const casos = [
    [{ ativo: false }, /desativada/],
    [{ auth: E }, /Ja existe alguem/],
  ];
  for (const [opcoes, msg] of casos) {
    const { banco, f } = await montar({ est: estado({ papeis: [], ...opcoes }) });
    const r = await f.chamar(DIRECAO, { action: "criarPessoa", conta: { usuario: "ficticia", nome: "Pessoa" }, papeis: [] });
    assert.equal(r.status, 409, JSON.stringify(opcoes));
    assert.match(r.body.erro, msg);
    assert.ok(banco.tabelas.acesso_conta.some((c) => c.id === ID), "a conta não é apagada");
    assert.ok(!("senha" in r.body));
  }
  {
    const { banco, f } = await montar();
    const r = await f.chamar(DIRECAO, { action: "criarPessoa", conta: { usuario: "leonardo", nome: "Outro" }, papeis: [] });
    assert.equal(r.status, 409);
    assert.ok(banco.tabelas.acesso_conta.some((c) => c.id === "c-dir"));
  }
  {
    // O cadastro pela metade de verdade (sem papel, ativo, sem identidade) continua sendo retomado.
    const { banco, f } = await montar({ est: estado({ papeis: [], auth: null }) });
    const r = await f.chamar(DIRECAO, { action: "criarPessoa", conta: { usuario: "ficticia", nome: "Pessoa" }, papeis: [] });
    assert.equal(r.status, 200);
    assert.ok(!banco.tabelas.acesso_conta.some((c) => c.id === ID), "a linha antiga saiu");
    assert.ok(banco.tabelas.acesso_conta.some((c) => c.usuario === "ficticia"), "e a nova entrou");
  }
});
