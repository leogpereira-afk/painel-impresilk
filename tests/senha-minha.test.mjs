/* (A) TROCAR A MINHA SENHA EM TODOS OS SISTEMAS (painel-auth, trocarMinhaSenha).
 *
 * A function roda inteira, com banco e Auth falsos (tests/apoio-senha.mjs).
 * Os casos ruins vem primeiro, de proposito: cada um e uma trava que custou
 * um incidente (contrato-senhas.md, secao 4.4). Todas as pessoas daqui sao
 * de mentira; nenhuma chamada sai da maquina.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { bancoFalso, carregar, cracha, hashDe, tudoQueSaiu } from "./apoio-senha.mjs";

const ID = "c0000000-0000-4000-8000-00000000000a";       // a pessoa (acesso_conta.id)
const E = "e0000000-0000-4000-8000-00000000000a";        // a identidade da entrada unica
const R = "f0000000-0000-4000-8000-00000000000a";        // uma identidade PROPRIA do RH
const ATUAL = "senha-atual-da-ficticia";
const NOVA = "senha-nova-da-ficticia";
const VELHO = { hash: "a".repeat(64), salt: "b".repeat(32), iter: 120000 };

const TOKEN = cracha({ sub: "ficticia", nome: "Pessoa Fictícia", master: false, perms: ["orcamentos"], vend: "" });

function estado({ papeis = ["painel", "pcp", "rh", "dre"], auth = E, perfilId = E, ficha = "ficha-1", tipo = "pessoa" } = {}) {
  return {
    acesso_conta: [{ id: ID, usuario: "ficticia", nome: "Pessoa Fictícia", tipo, colaborador: "Pessoa Ficticia Completa",
      colaborador_id: ficha, auth_user_id: auth, ativo: true, trocar_senha: true }],
    acesso_papel: papeis.map((sistema) => ({ conta_id: ID, sistema, papel: sistema === "pcp" ? "operador" : "", permissoes: [], login: "", ativo: true })),
    equipe_contas: [
      { sistema: "pcp", usuario: "ficticia", nome: "Fictícia", papel: "operador", ativo: true, ...VELHO, trocar_senha: true },
      { sistema: "brief", usuario: "outra", nome: "Outra", papel: "vendedor", ativo: true, ...VELHO, trocar_senha: false },
    ],
    painel_contas: [{ usuario: "ficticia", nome: "Fictícia", permissoes: ["orcamentos"], vendedor_id: "", ...VELHO }],
    perfis: perfilId ? [{ user_id: perfilId, usuario: "pessoa ficticia completa", colaborador_id: ficha }] : [],
    acesso_senha_legado: [{ conta_id: ID, origem: "propria", ...VELHO, usado_em: null }],
  };
}
const authBase = () => ({
  [E]: { email: "ficticia@impresilk.local", senha: ATUAL },
  [R]: { email: "pessoa.ficticia@rh.impresilk.local", senha: "senha-velha-do-rh" },
});

async function montar({ est = estado(), auth = authBase(), falhas = {} } = {}) {
  const banco = bancoFalso({ estado: est, auth, falhas });
  const f = await carregar("painel-auth", banco);
  return { banco, f };
}
const trocar = (f, corpo = {}, token = TOKEN) => f.chamar(token, { action: "trocarMinhaSenha", senhaAtual: ATUAL, novaSenha: NOVA, ...corpo });
const rpcs = (banco, nome) => banco.ops.filter((o) => o.tipo === "rpc" && o.nome === nome);
const auths = (banco, acao) => banco.ops.filter((o) => o.tipo === "auth" && o.acao === acao);
const gravacoes = (banco) => rpcs(banco, "acesso_senha_gravar").length + auths(banco, "update").length;

// ------------------------------------------------------------ os casos ruins

test("A1 senha atual errada: 401, nada gravado, ficha do freio gasta, log sem o que foi digitado", async () => {
  const { banco, f } = await montar();
  const r = await trocar(f, { senhaAtual: "palpite-errado-123" });
  assert.equal(r.status, 401);
  assert.equal(r.body.erro, "Senha atual incorreta.");
  assert.equal(gravacoes(banco), 0, "nem acesso_senha_gravar nem updateUserById");
  assert.equal(rpcs(banco, "porta_travada").length, 1);
  assert.equal(rpcs(banco, "porta_travada")[0].args.p_sistema, "senha-atual", "balde próprio, não o * da entrada");
  const log = banco.tabelas.equipe_acessos_log.find((l) => l.acao === "senha-atual-errada");
  assert.ok(log, "a tentativa errada deixa rastro");
  assert.equal(log.sistema, "senha-atual");
  assert.ok(!JSON.stringify(banco.tabelas.equipe_acessos_log).includes("palpite-errado-123"));
  assert.equal(banco.tabelas.painel_senha_operacao.length, 0, "nem chegou a reservar");
});

test("A2 a 11ª tentativa em 15 minutos para no freio, antes de conferir", async () => {
  const { banco, f } = await montar();
  for (let i = 0; i < 10; i++) assert.equal((await trocar(f, { senhaAtual: `errada-${i}-xx` })).status, 401);
  const antes = auths(banco, "signIn").length;
  const r = await trocar(f);   // agora com a senha CERTA: o freio vale igual
  assert.equal(r.status, 429);
  assert.match(r.body.erro, /Espere 15 minutos/);
  assert.equal(auths(banco, "signIn").length, antes, "nenhum signInWithPassword na 11ª");
  assert.ok(banco.tabelas.equipe_acessos_log.some((l) => l.acao === "troca-barrada"));
  assert.equal(gravacoes(banco), 0);
});

test("A3 crachá revogado, ou banco sem dizer se vale: 401 semSessao e nenhuma outra operação", async () => {
  for (const falhas of [{ revogado: true }, { rpc: { acesso_revogado: { message: "banco fora do ar (simulado)" } } }]) {
    const { banco, f } = await montar({ falhas });
    const r = await trocar(f);
    assert.equal(r.status, 401);
    assert.equal(r.body.semSessao, true);
    assert.deepEqual(banco.ops.filter((o) => !(o.tipo === "rpc" && o.nome === "acesso_revogado")), [], JSON.stringify(falhas));
  }
  // E sem crachá nenhum, ou com crachá de outro segredo.
  for (const token of ["", cracha({ sub: "ficticia" }, "segredo-de-outro-sistema")]) {
    const { banco, f } = await montar();
    assert.equal((await trocar(f, {}, token)).status, 401);
    assert.equal(banco.ops.length, 0);
  }
});

test("A4 GoTrue fora do ar ao conferir: 503, e não \"senha atual incorreta\"", async () => {
  for (const falhas of [{ signIn: "fora" }, { getUser: "fora" }]) {
    const { banco, f } = await montar({ falhas });
    const r = await trocar(f);
    assert.equal(r.status, 503, JSON.stringify(falhas));
    assert.doesNotMatch(r.body.erro, /incorreta/);
    assert.equal(gravacoes(banco), 0);
    assert.ok(!banco.tabelas.equipe_acessos_log.some((l) => l.acao === "senha-atual-errada"), "falha do Auth não é tentativa errada");
  }
});

test("A5 senha nova fora da regra: 400, nada gravado, nada aparado nem cortado", async () => {
  const casos = [
    ["curta", "12345", /ao menos 6/],
    ["73 bytes", "a".repeat(73), /no máximo 72 caracteres\.$/],
    ["acento conta dobrado", "é".repeat(37), /acento conta dobrado/],
    ["espaço no começo", " senha-com-espaco", /espaço/],
    ["espaço no fim", "senha-com-espaco ", /espaço/],
    ["igual à atual", ATUAL, /diferente da atual/],
    ["sem senha nova", undefined, /ao menos 6/],
    ["senha que não é texto", 12345678, /ao menos 6/],
  ];
  for (const [nome, novaSenha, msg] of casos) {
    const { banco, f } = await montar();
    const r = await trocar(f, { novaSenha });
    assert.equal(r.status, 400, nome);
    assert.match(r.body.erro, msg, nome);
    assert.equal(rpcs(banco, "porta_travada").length, 0, `${nome}: regra furada não gasta ficha`);
    assert.equal(gravacoes(banco), 0, nome);
  }
  const { f } = await montar();
  assert.equal((await trocar(f, { senhaAtual: "" })).status, 400, "sem a senha atual");
});

test("A6 reserva ocupada (A e B da mesma pessoa juntos): 409 e nada gravado", async () => {
  const { banco, f } = await montar({ falhas: { reservado: new Set(["ficticia"]) } });
  const r = await trocar(f);
  assert.equal(r.status, 409);
  assert.match(r.body.erro, /em andamento/);
  assert.equal(gravacoes(banco), 0);
});

test("A7a a entrada única (E) recusa: 500 \"anterior continua valendo\", banco nem é chamado", async () => {
  const { banco, f } = await montar({ falhas: { update: new Set([E]) } });
  const r = await trocar(f);
  assert.equal(r.status, 500);
  assert.match(r.body.erro, /anterior continua valendo em todos/);
  assert.equal(rpcs(banco, "acesso_senha_gravar").length, 0);
  assert.equal(banco.usuarios.get(E).senha, ATUAL);
  assert.equal(banco.tabelas.painel_senha_operacao.length, 0, "a reserva é liberada também na falha");
});

test("A7b o banco recusa depois de E: a atual volta para E e a resposta diz que nada mudou", async () => {
  const { banco, f } = await montar({ falhas: { rpc: { acesso_senha_gravar: { message: "banco recusou (simulado)" } } } });
  const r = await trocar(f);
  assert.equal(r.status, 500);
  assert.match(r.body.erro, /anterior continua valendo em todos/);
  assert.equal(auths(banco, "update").length, 2, "aplicou e desfez");
  assert.equal(banco.usuarios.get(E).senha, ATUAL, "o Auth terminou com a senha atual");
  assert.equal(banco.tabelas.equipe_contas[0].hash, VELHO.hash);
  assert.ok(banco.tabelas.equipe_acessos_log.some((l) => l.acao === "troca-falhou" && l.sistema === "*"));
});

test("A7c o banco recusa e desfazer E também falha: a mensagem diz qual senha ficou valendo", async () => {
  const { banco, f } = await montar({
    falhas: { rpc: { acesso_senha_gravar: { message: "banco recusou (simulado)" } }, update: (id, n) => id === E && n === 2 },
  });
  const r = await trocar(f);
  assert.equal(r.status, 500);
  assert.match(r.body.erro, /senha nova já vale na entrada pelo Painel/);
  assert.match(r.body.erro, /repita a troca/);
  assert.equal(banco.usuarios.get(E).senha, NOVA);
});

test("A8 o RH com identidade própria recusa no fim: 200 parcial, e o resto já vale", async () => {
  const { banco, f } = await montar({ est: estado({ perfilId: R }), falhas: { update: new Set([R]) } });
  const r = await trocar(f);
  assert.equal(r.status, 200);
  assert.equal(r.body.parcial, true);
  const rh = r.body.sistemas.find((s) => s.sistema === "rh");
  assert.equal(rh.resultado, "falhou");
  assert.ok(rh.motivo, "diz por quê");
  assert.equal(banco.usuarios.get(E).senha, NOVA, "a entrada já tem a nova");
  assert.notEqual(banco.tabelas.equipe_contas[0].hash, VELHO.hash, "o banco já tem a nova");
  assert.equal(banco.usuarios.get(R).senha, "senha-velha-do-rh");
  assert.ok(banco.tabelas.equipe_acessos_log.some((l) => l.sistema === "rh" && l.acao === "troca-falhou"));
});

test("A9 login diferente por sistema: o banco recebe o login DAQUELE sistema", async () => {
  const est = estado();
  est.acesso_papel.find((p) => p.sistema === "pcp").login = "fict";
  est.equipe_contas.push({ sistema: "pcp", usuario: "fict", nome: "Fict", papel: "operador", ativo: true, ...VELHO, trocar_senha: false });
  const { banco, f } = await montar({ est });
  const r = await trocar(f);
  assert.equal(r.status, 200);
  const [chamada] = rpcs(banco, "acesso_senha_gravar");
  assert.deepEqual(chamada.args.p_equipe, [{ sistema: "pcp", usuario: "fict" }]);
  assert.equal(banco.tabelas.equipe_contas.find((l) => l.usuario === "ficticia").hash, VELHO.hash, "a sósia com o nome da pessoa não é tocada");
  assert.equal(r.body.sistemas.find((s) => s.sistema === "pcp").login, "fict");
});

test("A10 pessoa sem papel nenhum (e sem ficha): só o Painel e a entrada", async () => {
  const { banco, f } = await montar({ est: estado({ papeis: [], perfilId: null, ficha: null }) });
  const r = await trocar(f);
  assert.equal(r.status, 200);
  assert.equal(r.body.entrada, "trocada");
  assert.deepEqual(r.body.sistemas.map((s) => [s.sistema, s.resultado]), [["painel", "trocada"]]);
  assert.deepEqual(rpcs(banco, "acesso_senha_gravar")[0].args.p_equipe, []);
});

test("A11 conta ainda não consolidada (sem acesso_conta): só o Painel, entrada \"nao-consolidada\"", async () => {
  const est = estado();
  est.acesso_conta = [];
  est.painel_contas = [{ usuario: "ficticia", nome: "Fictícia", permissoes: ["orcamentos"], vendedor_id: "", ...(await hashDe(ATUAL)) }];
  const { banco, f } = await montar({ est });
  const r = await trocar(f);
  assert.equal(r.status, 200);
  assert.equal(r.body.entrada, "nao-consolidada");
  const [chamada] = rpcs(banco, "acesso_senha_gravar");
  assert.equal(chamada.args.p_conta, null);
  assert.deepEqual(chamada.args.p_equipe, []);
  assert.deepEqual(chamada.args.p_painel, { usuario: "ficticia" });
  assert.equal(auths(banco, "update").length, 0);
});

test("A12 papel em DRE, Central, Bosques e Domo nunca vira loja gravada", async () => {
  const { banco, f } = await montar({ est: estado({ papeis: ["painel", "pcp", "dre", "central", "bosques", "domo"] }) });
  const r = await trocar(f);
  assert.equal(r.status, 200);
  const gravados = rpcs(banco, "acesso_senha_gravar")[0].args.p_equipe.map((i) => i.sistema);
  for (const s of ["dre", "central", "bosques", "domo"]) assert.ok(!gravados.includes(s), s);
  const por = Object.fromEntries(r.body.sistemas.map((s) => [s.sistema, s.resultado]));
  assert.equal(por.dre, "pela-entrada");
  assert.equal(por.central, "pela-entrada");
  assert.equal(por.bosques, "fora");
  assert.equal(por.domo, "fora");
});

test("A13 papel marcado sem conta no sistema: \"sem-conta\", e nunca pedido ao banco", async () => {
  const { banco, f } = await montar({ est: estado({ papeis: ["painel", "pcp", "pops"] }) });
  const r = await trocar(f);
  assert.equal(r.status, 200);
  const pops = r.body.sistemas.find((s) => s.sistema === "pops");
  assert.equal(pops.resultado, "sem-conta");
  assert.match(pops.motivo, /não existe conta "ficticia"/);
  assert.ok(!rpcs(banco, "acesso_senha_gravar")[0].args.p_equipe.some((i) => i.sistema === "pops"));
  assert.equal(r.body.parcial, false, "sem conta não é falha");
});

test("A14 quem não é a direção e não tem linha no Painel nunca manda \"criar\"", async () => {
  const est = estado();
  est.painel_contas = [];
  const { banco, f } = await montar({ est });
  const r = await trocar(f);
  assert.equal(r.status, 200);
  assert.equal(rpcs(banco, "acesso_senha_gravar")[0].args.p_painel, null);
  assert.equal(r.body.sistemas.find((s) => s.sistema === "painel").resultado, "sem-conta");
  assert.equal(banco.tabelas.painel_contas.length, 0);
});

test("A14b a direção sem linha própria (senha inicial) ganha a linha dela, só ela", async () => {
  const banco = bancoFalso({ estado: { painel_contas: [] } });
  const f = await carregar("painel-auth", banco, { PAINEL_AUTH_MASTER_SENHA: "senha-inicial-ficticia" });
  const r = await f.chamar(cracha({ sub: "leonardo", master: true, perms: ["*"] }),
    { action: "trocarMinhaSenha", senhaAtual: "senha-inicial-ficticia", novaSenha: NOVA });
  assert.equal(r.status, 200);
  const [chamada] = rpcs(banco, "acesso_senha_gravar");
  assert.deepEqual(chamada.args.p_painel, { usuario: "leonardo", criar: { nome: "Direção", permissoes: ["*"] } });
  assert.deepEqual(banco.tabelas.painel_contas.map((c) => [c.usuario, c.permissoes]), [["leonardo", ["*"]]]);
});

test("A15 o alvo é o dono do crachá: `usuario` no corpo é ignorado", async () => {
  const est = estado();
  est.acesso_conta.push({ id: "c-outra", usuario: "leonardo", nome: "Outro", tipo: "pessoa", auth_user_id: null, ativo: true });
  est.painel_contas.push({ usuario: "leonardo", nome: "Outro", permissoes: ["*"], vendedor_id: "", ...VELHO });
  const { banco, f } = await montar({ est });
  const r = await trocar(f, { usuario: "leonardo" });
  assert.equal(r.status, 200);
  assert.equal(banco.tabelas.painel_contas.find((c) => c.usuario === "leonardo").hash, VELHO.hash);
  assert.notEqual(banco.tabelas.painel_contas.find((c) => c.usuario === "ficticia").hash, VELHO.hash);
  assert.equal(rpcs(banco, "painel_senha_reservar")[0].args.p_usuario, "ficticia");
});

test("A16 não migrada que tem RH: o RH recebe a nova (fecha o 409 da entrada única)", async () => {
  const est = estado({ auth: null, perfilId: R });
  est.painel_contas = [{ usuario: "ficticia", nome: "Fictícia", permissoes: ["orcamentos"], vendedor_id: "", ...(await hashDe(ATUAL)) }];
  const { banco, f } = await montar({ est });
  const r = await trocar(f);
  assert.equal(r.status, 200);
  assert.equal(banco.usuarios.get(R).senha, NOVA);
  assert.equal(r.body.sistemas.find((s) => s.sistema === "rh").resultado, "trocada");
  assert.equal(banco.tabelas.acesso_senha_legado.length, 1, "a guarda da entrada vira UMA linha");
  assert.equal(banco.tabelas.acesso_senha_legado[0].origem, "propria");
});

// ------------------------------------------------------------ o caminho bom

test("A17 sucesso: nada do que sai carrega a senha nem o hash, e a nova vale como definitiva", async () => {
  const { banco, f } = await montar();
  const r = await trocar(f);
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.parcial, false);
  assert.equal(r.body.entrada, "trocada");
  assert.equal(banco.usuarios.get(E).senha, NOVA);
  const pcp = banco.tabelas.equipe_contas.find((l) => l.sistema === "pcp");
  assert.notEqual(pcp.hash, VELHO.hash);
  assert.equal(pcp.trocar_senha, false, "a nova é definitiva");
  assert.equal(banco.tabelas.acesso_conta[0].trocar_senha, false, "a marca da pessoa sai");
  assert.equal(banco.tabelas.equipe_contas.find((l) => l.usuario === "outra").hash, VELHO.hash, "conta de outra pessoa intocada");
  const saiu = tudoQueSaiu(banco, [r]);
  for (const segredo of [NOVA, ATUAL, pcp.hash, pcp.salt]) assert.ok(!saiu.includes(segredo), "vazou um segredo");
  assert.ok(!("senha" in r.body));
  // Uma linha por loja, com o login de cada sistema, e quem trocou.
  const log = banco.tabelas.equipe_acessos_log.filter((l) => l.acao === "trocou-senha");
  assert.deepEqual(log.map((l) => l.sistema).sort(), ["*", "painel", "pcp", "rh"].sort());
  assert.ok(log.every((l) => l.por === "painel:ficticia" && l.detalhe === "própria"));
  assert.equal(log.find((l) => l.sistema === "rh").usuario, "pessoa ficticia completa");
  assert.equal(rpcs(banco, "painel_senha_sincronizar").length, 0, "o caminho antigo não é mais usado");
  assert.equal(banco.tabelas.painel_senha_operacao.length, 0, "a reserva foi liberada");
  // R = E: uma gravação só no Auth.
  assert.equal(auths(banco, "update").length, 1);
});

// ------------------------------------------- a marca de provisória (§5)

test("login e eu devolvem trocarSenha lido da pessoa; a entrada única também", async () => {
  const est = estado();   // a pessoa está marcada (trocar_senha: true)
  const banco = bancoFalso({ estado: est, auth: authBase() });
  const f = await carregar("painel-auth", banco);
  const login = await f.chamar("", { action: "login", usuario: "ficticia", senha: ATUAL });
  assert.equal(login.status, 200);
  assert.equal(login.body.trocarSenha, true);
  const eu = await f.chamar(login.body.token, { action: "eu" });
  assert.equal(eu.body.trocarSenha, true, "recarregar a página não fura a obrigação");

  banco.tabelas.acesso_conta[0].trocar_senha = false;
  assert.equal((await f.chamar(login.body.token, { action: "eu" })).body.trocarSenha, false);

  const b2 = bancoFalso({ estado: estado(), auth: authBase() });
  const entrada = await carregar("acesso-entrar", b2);
  const r = await entrada.chamar("", { action: "entrar", usuario: "ficticia", senha: ATUAL });
  assert.equal(r.status, 200);
  assert.equal(r.body.trocarSenha, true);
  assert.ok(r.body.crachas.painel, "os crachás continuam saindo; quem segura é a tela");
});

test("a direção já migrada e sem linha no Painel não é obrigada a trocar a cada entrada", async () => {
  const banco = bancoFalso({
    estado: { acesso_conta: [{ id: "c-dir", usuario: "leonardo", auth_user_id: E, ativo: true, trocar_senha: false }] },
    auth: { [E]: { email: "leonardo@impresilk.local", senha: ATUAL } },
  });
  const f = await carregar("painel-auth", banco, { PAINEL_AUTH_MASTER_SENHA: "senha-inicial-ficticia" });
  const r = await f.chamar("", { action: "login", usuario: "leonardo", senha: ATUAL });
  assert.equal(r.status, 200);
  assert.equal(r.body.trocarSenha, false);
  const inicial = bancoFalso({ estado: {} });
  const g = await carregar("painel-auth", inicial, { PAINEL_AUTH_MASTER_SENHA: "senha-inicial-ficticia" });
  const r2 = await g.chamar("", { action: "login", usuario: "leonardo", senha: "senha-inicial-ficticia" });
  assert.equal(r2.body.trocarSenha, true, "na senha inicial do ambiente, obriga");
});

test("eu com o banco sem responder não prende ninguém na troca obrigatória", async () => {
  const token = cracha({ sub: "leonardo", nome: "Direção", master: true, perms: ["*"], vend: "" });
  for (const tabela of ["acesso_conta", "painel_contas"]) {
    const banco = bancoFalso({ estado: {}, falhas: { tabela: { [tabela]: { message: "fora do ar (simulado)" } } } });
    const f = await carregar("painel-auth", banco);
    const r = await f.chamar(token, { action: "eu" });
    assert.equal(r.status, 200, tabela);
    assert.equal(r.body.trocarSenha, false, `${tabela}: erro de leitura não é "obrigar a trocar"`);
  }
});

// ------------------------------- loja que também é de outra pessoa (revisão)

const E_DIR = "e0000000-0000-4000-8000-0000000000dd";
const DONO = { id: "c-dir", usuario: "leonardo", nome: "Direção", tipo: "pessoa", colaborador: "Leonardo Ficticio", colaborador_id: "ficha-dir", auth_user_id: E_DIR, ativo: true };

test("A18 login apontado para a conta de outra pessoa (o `leo` da direção): a troca própria não chega lá", async () => {
  const est = estado();
  est.acesso_conta.push(DONO);
  est.acesso_papel.push({ conta_id: "c-dir", sistema: "pcp", papel: "admin", permissoes: [], login: "leo", ativo: true });
  est.acesso_papel.find((p) => p.conta_id === ID && p.sistema === "pcp").login = "leo";   // o vínculo errado
  est.equipe_contas.push({ sistema: "pcp", usuario: "leo", nome: "Leo", papel: "admin", ativo: true, ...VELHO, trocar_senha: false });
  const { banco, f } = await montar({ est });
  const r = await trocar(f);
  assert.equal(r.status, 200);
  const [g] = rpcs(banco, "acesso_senha_gravar");
  assert.ok(!g.args.p_equipe.some((x) => x.usuario === "leo"), "a conta da direção nunca vai para o banco");
  assert.equal(banco.tabelas.equipe_contas.find((l) => l.usuario === "leo").hash, VELHO.hash);
  const pcp = r.body.sistemas.find((s) => s.sistema === "pcp");
  assert.equal(pcp.resultado, "sem-conta");
  assert.match(pcp.motivo, /também é de Direção/);
});

test("A19 ficha do RH ligada também a outra conta: o RH fica de fora, com o motivo", async () => {
  const est = estado({ perfilId: R });
  est.acesso_conta.push({ ...DONO, colaborador_id: "ficha-1", auth_user_id: null });   // a mesma ficha
  const { banco, f } = await montar({ est });
  const r = await trocar(f);
  assert.equal(r.status, 200);
  assert.equal(banco.usuarios.get(R).senha, "senha-velha-do-rh", "a identidade do RH não é tocada");
  const rh = r.body.sistemas.find((s) => s.sistema === "rh");
  assert.equal(rh.resultado, "sem-conta");
  assert.match(rh.motivo, /também está ligada a Direção/);
});

test("A20 entrada dividida com outra conta: 409, nada gravado em lugar nenhum", async () => {
  for (const outra of [{ ...DONO, auth_user_id: E }, { ...DONO, auth_user_id: null, colaborador_id: "ficha-x" }]) {
    const est = estado();
    est.acesso_conta.push(outra);
    // No segundo caso, E é a identidade do RH da ficha de OUTRA conta.
    if (outra.colaborador_id === "ficha-x") est.perfis.push({ user_id: E, usuario: "leonardo ficticio", colaborador_id: "ficha-x" });
    const { banco, f } = await montar({ est });
    const r = await trocar(f);
    assert.equal(r.status, 409, JSON.stringify(outra.colaborador_id));
    assert.match(r.body.erro, /Não troquei nada/);
    assert.equal(gravacoes(banco), 0);
    assert.equal(banco.usuarios.get(E).senha, ATUAL);
    assert.equal(banco.tabelas.painel_senha_operacao.length, 0, "a reserva é liberada");
  }
});

test("A21 Auth sem resposta ao gravar: a atual é regravada; sem confirmação, a mensagem não promete \"nada mudou\"", async () => {
  {
    // Gravou e a resposta se perdeu: a atual volta, e aí sim nada mudou.
    const { banco, f } = await montar({ falhas: { updateSumiu: (id, n) => id === E && n === 1 } });
    const r = await trocar(f);
    assert.equal(r.status, 500);
    assert.match(r.body.erro, /anterior continua valendo em todos/);
    assert.equal(banco.usuarios.get(E).senha, ATUAL, "a entrada voltou para a atual");
    assert.equal(rpcs(banco, "acesso_senha_gravar").length, 0);
  }
  {
    // Nem gravar nem regravar respondem: não dá para saber o que ficou na entrada.
    const { banco, f } = await montar({ falhas: { updateSumiu: new Set([E]) } });
    const r = await trocar(f);
    assert.equal(r.status, 500);
    assert.doesNotMatch(r.body.erro, /continua valendo em todos/);
    assert.match(r.body.erro, /Não consegui confirmar/);
    assert.equal(rpcs(banco, "acesso_senha_gravar").length, 0, "o banco não é gravado na dúvida");
  }
  {
    // 422 é recusa certa: não precisa regravar.
    const { banco, f } = await montar({ falhas: { update: new Set([E]) } });
    await trocar(f);
    assert.equal(auths(banco, "update").length, 1);
  }
});

test("A22 a reserva vem antes de conferir a senha atual", async () => {
  const { banco, f } = await montar();
  const r = await trocar(f);
  assert.equal(r.status, 200);
  const i = (pred) => banco.ops.findIndex(pred);
  const reservou = i((o) => o.tipo === "rpc" && o.nome === "painel_senha_reservar");
  const conferiu = i((o) => o.tipo === "auth" && o.acao === "signIn");
  assert.ok(reservou >= 0 && conferiu > reservou, "reservar, depois conferir");
  const ocupada = await montar({ falhas: { reservado: new Set(["ficticia"]) } });
  assert.equal((await trocar(ocupada.f)).status, 409);
  assert.equal(auths(ocupada.banco, "signIn").length, 0, "com outra troca em andamento, nem confere");
});

test("A23 RH sem resposta ao gravar, mas a nova abre: não sai como falha", async () => {
  const { banco, f } = await montar({ est: estado({ perfilId: R }), falhas: { updateSumiu: new Set([R]) } });
  const r = await trocar(f);
  assert.equal(r.status, 200);
  assert.equal(r.body.parcial, false);
  assert.equal(banco.usuarios.get(R).senha, NOVA);
});
