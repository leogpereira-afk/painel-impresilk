// Apoio dos testes das senhas (tests/senha-*.test.mjs). NAO e teste: e o
// banco falso, o Auth falso e o carregador das functions.
//
// Nada aqui encosta no Supabase. A function e montada com o esbuild e roda
// inteira, com UMA troca so: `createClient` passa a devolver o banco falso.
// O cracha e de verdade (HS256 com um segredo de teste) e a revogacao passa
// pelo `crachaRevogado` de verdade, que pergunta ao banco falso.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHmac, randomUUID } from "node:crypto";
import { build } from "esbuild";

export const SEGREDO = "segredo-ficticio-so-dos-testes-de-senha";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export function cracha(payload, segredo = SEGREDO) {
  const agora = Math.floor(Date.now() / 1000);
  const h = b64({ alg: "HS256", typ: "JWT" });
  const d = b64({ iat: agora, exp: agora + 600, ...payload });
  return `${h}.${d}.${createHmac("sha256", segredo).update(`${h}.${d}`).digest("base64url")}`;
}

// O mesmo PBKDF2 da casa (_shared/cripto.ts), para semear hash de senha atual.
export async function hashDe(senha, saltHex = "00112233445566778899aabbccddeeff") {
  const salt = Buffer.from(saltHex, "hex");
  const km = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), { name: "PBKDF2" }, false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" }, km, 256);
  return { hash: Buffer.from(bits).toString("hex"), salt: saltHex, iter: 120000 };
}

const SISTEMAS_SEM_LOJA = ["painel", "rh", "central", "dre", "bosques", "domo"];

/**
 * O banco falso. `estado` semeia as tabelas; `auth` os usuarios do Auth
 * ({id: {email, senha}}). `falhas` liga os defeitos de proposito:
 *   rpc[nome] = {message}      a funcao de banco devolve erro
 *   tabela[nome] = {message}   toda consulta nessa tabela devolve erro
 *   signIn = "fora"            o GoTrue nao responde ao conferir
 *   getUser = "fora"           o admin do Auth nao responde
 *   update = Set(ids)          o Auth recusa gravar a senha desses ids (422); ou
 *   update = (id, n) => bool   recusa so na n-esima gravacao daquele id
 *   updateSumiu = Set | fn     o Auth GRAVA, mas a resposta se perde (status 0)
 *   updateFora = Set | fn      o Auth nao responde e nao grava (503)
 *   antesDeGravar = (t) => {}  mexe nas tabelas entre a leitura e a gravacao
 *   revogado = true            o cracha foi revogado
 *   reservado = Set(usuarios)  ja ha troca em andamento para essas pessoas
 */
export function bancoFalso({ estado = {}, auth = {}, falhas = {} } = {}) {
  const t = {
    acesso_conta: [], acesso_papel: [], acesso_senha_legado: [], equipe_contas: [],
    painel_contas: [], perfis: [], equipe_acessos_log: [], painel_senha_operacao: [], registros: [],
    ...structuredClone(estado),
  };
  const usuarios = new Map(Object.entries(structuredClone(auth)));
  const ops = [];
  const freio = new Map();
  const f = { rpc: {}, tabela: {}, update: new Set(), updateSumiu: new Set(), updateFora: new Set(), reservado: new Set(), ...falhas };
  const liga = (regra, id, n) => (typeof regra === "function" ? regra(id, n) : regra.has(id));

  function executar(q) {
    ops.push({ tipo: "from", tabela: q.tabela, acao: q.acao });
    if (f.tabela[q.tabela]) return { data: null, error: { message: f.tabela[q.tabela].message } };
    const linhas = (t[q.tabela] ??= []);
    const casa = (l) => q.filtros.every((fn) => fn(l));
    if (q.acao === "select") {
      const achadas = linhas.filter(casa).map((l) => structuredClone(l));
      if (q.opcoes?.head) return { data: null, count: achadas.length, error: null };
      if (q.modo === "talvez") return achadas.length > 1 ? { data: null, error: { message: "mais de uma linha" } } : { data: achadas[0] ?? null, error: null };
      if (q.modo === "um") return achadas.length === 1 ? { data: achadas[0], error: null } : { data: null, error: { message: "nao achei" } };
      return { data: achadas, error: null };
    }
    if (q.acao === "update") {
      const achadas = linhas.filter(casa);
      for (const l of achadas) Object.assign(l, structuredClone(q.valores));
      return { data: q.retornar ? achadas.map((l) => structuredClone(l)) : null, error: null };
    }
    if (q.acao === "delete") {
      t[q.tabela] = linhas.filter((l) => !casa(l));
      return { data: null, error: null };
    }
    if (q.acao === "insert" || q.acao === "upsert") {
      const novas = Array.isArray(q.valores) ? q.valores : [q.valores];
      const chaves = String(q.opcoes?.onConflict ?? "").split(",").filter(Boolean);
      for (const n of novas) {
        const ja = chaves.length ? linhas.find((l) => chaves.every((k) => l[k] === n[k])) : null;
        if (ja && q.acao === "upsert") Object.assign(ja, structuredClone(n));
        else linhas.push({ ...(q.tabela === "acesso_conta" ? { id: randomUUID() } : {}), ...structuredClone(n) });
      }
      if (q.tabela === "acesso_senha_legado") for (const n of novas) marcarPelaOrigem(n.conta_id, n.origem);
      return { data: q.modo ? structuredClone(linhas[linhas.length - 1]) : null, error: null };
    }
    return { data: null, error: { message: `acao ${q.acao} nao suportada no falso` } };
  }

  function consulta(tabela) {
    const q = { tabela, acao: "select", filtros: [], valores: null, opcoes: {}, modo: null, retornar: false };
    const api = {
      select(_c, opcoes) { if (q.acao === "select") q.opcoes = opcoes ?? {}; else q.retornar = true; return api; },
      insert(v) { q.acao = "insert"; q.valores = v; return api; },
      upsert(v, o) { q.acao = "upsert"; q.valores = v; q.opcoes = o ?? {}; return api; },
      update(v) { q.acao = "update"; q.valores = v; return api; },
      delete() { q.acao = "delete"; return api; },
      eq(c, v) { q.filtros.push((l) => l[c] === v); return api; },
      neq(c, v) { q.filtros.push((l) => l[c] !== v); return api; },
      in(c, vs) { q.filtros.push((l) => vs.includes(l[c])); return api; },
      is(c, v) { q.filtros.push((l) => (l[c] ?? null) === v); return api; },
      not() { return api; }, gte() { return api; }, order() { return api; }, limit() { return api; },
      maybeSingle() { q.modo = "talvez"; return api; },
      single() { q.modo = "um"; return api; },
      then(ok, erro) { return Promise.resolve().then(() => executar(q)).then(ok, erro); },
    };
    return api;
  }

  // O gatilho da migracao, em miniatura (o de verdade e testado no PGlite).
  function marcarPelaOrigem(contaId, origem) {
    const c = t.acesso_conta.find((x) => x.id === contaId);
    if (c) { c.trocar_senha = ["direcao", "central"].includes(origem) && c.tipo !== "funcao"; c.senha_trocada_em = "agora"; }
  }

  // acesso_senha_gravar, com as MESMAS recusas da migracao, e tudo ou nada.
  function gravar(a) {
    const foto = structuredClone(t);
    try {
      const h = a.p_hash ?? {};
      if (!h.hash || !h.salt || !(Number(h.iter) >= 100000)) throw new Error("hash inválido");
      if (!["propria", "direcao"].includes(a.p_origem)) throw new Error("origem inválida");
      if (typeof a.p_temporaria !== "boolean") throw new Error("falta dizer se a senha é provisória");
      const equipe = a.p_equipe ?? [];
      if (a.p_conta == null && (a.p_origem !== "propria" || equipe.length)) throw new Error("sem a pessoa, só a própria troca no Painel");
      const antes = { equipe: [], painel: null, legado: [], pessoa: null };
      const vistos = new Set();
      for (const it of equipe) {
        if (SISTEMAS_SEM_LOJA.includes(it.sistema)) throw new Error(`o sistema ${it.sistema} não recebe senha por aqui`);
        const k = `${it.sistema}/${it.usuario}`;
        if (vistos.has(k)) throw new Error(`conta repetida: ${k}`);
        vistos.add(k);
        const l = t.equipe_contas.find((x) => x.sistema === it.sistema && x.usuario === it.usuario);
        if (!l) throw new Error(`não existe a conta ${it.usuario} no ${it.sistema}`);
        antes.equipe.push({ sistema: l.sistema, usuario: l.usuario, hash: l.hash, salt: l.salt, iter: l.iter, trocar_senha: l.trocar_senha });
        Object.assign(l, { hash: h.hash, salt: h.salt, iter: h.iter, trocar_senha: a.p_temporaria, atualizado_em: "agora" });
      }
      if (a.p_painel) {
        const l = t.painel_contas.find((x) => x.usuario === a.p_painel.usuario);
        if (l) {
          antes.painel = { usuario: l.usuario, hash: l.hash, salt: l.salt, iter: l.iter };
          Object.assign(l, { hash: h.hash, salt: h.salt, iter: h.iter, atualizado_em: "agora" });
        } else if (a.p_painel.criar) {
          if (a.p_origem !== "propria" || JSON.stringify(a.p_painel.criar.permissoes) !== '["*"]') throw new Error("só a direção cria");
          t.painel_contas.push({ usuario: a.p_painel.usuario, nome: a.p_painel.criar.nome, permissoes: ["*"], vendedor_id: "", hash: h.hash, salt: h.salt, iter: h.iter });
          antes.painel = { usuario: a.p_painel.usuario, criada: true };
        } else throw new Error(`não existe a conta ${a.p_painel.usuario} no Painel`);
      }
      if (a.p_conta != null) {
        const c = t.acesso_conta.find((x) => x.id === a.p_conta);
        if (!c) throw new Error("pessoa não encontrada");
        antes.pessoa = { trocar_senha: c.trocar_senha ?? false, senha_trocada_em: c.senha_trocada_em ?? null };
        antes.legado = t.acesso_senha_legado.filter((x) => x.conta_id === a.p_conta).map((x) => structuredClone(x));
        t.acesso_senha_legado = t.acesso_senha_legado.filter((x) => x.conta_id !== a.p_conta);
        t.acesso_senha_legado.push({ conta_id: a.p_conta, origem: a.p_origem, hash: h.hash, salt: h.salt, iter: h.iter, usado_em: null });
        c.trocar_senha = a.p_temporaria; c.senha_trocada_em = "agora";
      }
      return { data: { antes }, error: null };
    } catch (e) {
      for (const k of Object.keys(t)) t[k] = foto[k];
      return { data: null, error: { message: e.message } };
    }
  }

  function repor(a) {
    const g = a.p_hash_gravado;
    for (const it of a.p_antes.equipe ?? []) {
      const l = t.equipe_contas.find((x) => x.sistema === it.sistema && x.usuario === it.usuario && x.hash === g);
      if (l) Object.assign(l, { hash: it.hash, salt: it.salt, iter: it.iter, trocar_senha: it.trocar_senha });
    }
    if (a.p_antes.painel) {
      const p = a.p_antes.painel;
      if (p.criada) t.painel_contas = t.painel_contas.filter((x) => !(x.usuario === p.usuario && x.hash === g));
      else { const l = t.painel_contas.find((x) => x.usuario === p.usuario && x.hash === g); if (l) Object.assign(l, { hash: p.hash, salt: p.salt, iter: p.iter }); }
    }
    if (a.p_conta != null) {
      t.acesso_senha_legado = t.acesso_senha_legado.filter((x) => x.conta_id !== a.p_conta).concat(structuredClone(a.p_antes.legado ?? []));
      const c = t.acesso_conta.find((x) => x.id === a.p_conta);
      if (c) Object.assign(c, a.p_antes.pessoa ?? {});
    }
    return { data: { repostas: 1, puladas: 0 }, error: null };
  }

  async function rpc(nome, args) {
    ops.push({ tipo: "rpc", nome, args: structuredClone(args) });
    if (f.rpc[nome]) return { data: null, error: { message: f.rpc[nome].message } };
    switch (nome) {
      case "acesso_revogado": return { data: f.revogado === true, error: null };
      case "porta_travada": {
        const k = `${args.p_sistema}|${String(args.p_usuario).toLowerCase()}`;
        const n = (freio.get(k) ?? 0) + 1;
        freio.set(k, n);
        return { data: n > 10, error: null };
      }
      case "porta_registrar":
        t.equipe_acessos_log.push({ sistema: args.p_sistema, usuario: String(args.p_usuario).toLowerCase(), acao: args.p_acao, por: args.p_por ?? "", detalhe: args.p_detalhe ?? "" });
        return { data: null, error: null };
      case "painel_senha_reservar": {
        if (f.reservado.has(args.p_usuario) || t.painel_senha_operacao.some((x) => x.usuario === args.p_usuario)) return { data: false, error: null };
        t.painel_senha_operacao.push({ usuario: args.p_usuario, operacao: args.p_operacao });
        return { data: true, error: null };
      }
      case "acesso_senha_gravar": if (f.antesDeGravar) f.antesDeGravar(t); return gravar(args);
      case "acesso_senha_repor": return repor(args);
      case "derrubar_sessoes": return { data: null, error: null };
      default: return { data: null, error: { message: `rpc ${nome} nao existe no falso` } };
    }
  }

  const authFalso = {
    admin: {
      async getUserById(id) {
        ops.push({ tipo: "auth", acao: "getUser", id });
        if (f.getUser === "fora") return { data: { user: null }, error: { status: 500, message: "GoTrue fora do ar" } };
        const u = usuarios.get(id);
        return u ? { data: { user: { id, email: u.email } }, error: null } : { data: { user: null }, error: { status: 404, message: "User not found" } };
      },
      async updateUserById(id, { password }) {
        ops.push({ tipo: "auth", acao: "update", id });
        const n = ops.filter((o) => o.tipo === "auth" && o.acao === "update" && o.id === id).length;
        const recusa = liga(f.update, id, n);
        if (recusa) return { data: null, error: { status: 422, message: "Auth recusou a senha (simulado)" } };
        if (liga(f.updateFora, id, n)) return { data: null, error: { status: 503, message: "GoTrue fora do ar (simulado)" } };
        const u = usuarios.get(id);
        if (!u) return { data: null, error: { status: 404, message: "User not found" } };
        u.senha = password;
        if (liga(f.updateSumiu, id, n)) return { data: null, error: { status: 0, message: "fetch failed (simulado)" } };
        return { data: { user: { id } }, error: null };
      },
    },
    async signInWithPassword({ email, password }) {
      ops.push({ tipo: "auth", acao: "signIn", email });
      if (f.signIn === "fora") return { data: { session: null }, error: { status: 0, message: "fetch failed" } };
      const u = [...usuarios.values()].find((x) => x.email === email);
      if (u && u.senha === password) return { data: { session: { access_token: "falso" } }, error: null };
      return { data: { session: null }, error: { status: 400, code: "invalid_credentials", message: "Invalid login credentials" } };
    },
  };

  const cliente = { from: consulta, rpc, auth: authFalso };
  return { cliente, tabelas: t, usuarios, ops, falhas: f };
}

const AMBIENTE = {
  SUPABASE_URL: "https://banco-falso.invalid",
  SUPABASE_SERVICE_ROLE_KEY: "service-falsa",
  PAINEL_JWT_SECRET: SEGREDO,
  ANON_KEY_IMPRESILK: "anon-falsa",
  PAINEL_TOKEN: "token-de-maquina-falso",
  PAINEL_AUTH_MASTER_USUARIO: "leonardo",
  PAINEL_AUTH_MASTER_SENHA: "",
  LEO_SESSION_SECRET: "leo-falso",
  EQUIPE_JWT_SECRET: "equipe-falso",
};

/** Monta a function com o banco falso e devolve `chamar(token, corpo)`. */
export async function carregar(nome, banco, ambiente = {}) {
  let handler;
  const env = { ...AMBIENTE, ...ambiente };
  const fetches = [];
  const corpos = [];
  globalThis.Deno = { env: { get: (k) => env[k] ?? "", toObject: () => ({ ...env }) }, serve: (fn) => { handler = fn; } };
  // Nenhuma chamada HTTP pode sair (a equipe-auth, por exemplo): so registra e falha.
  globalThis.fetch = async (url, init) => {
    fetches.push(String(url));
    try { corpos.push(JSON.parse(String(init?.body ?? "null"))); } catch { corpos.push(null); }
    throw new Error("rede desligada nos testes");
  };
  globalThis.__bancoSenha = banco.cliente;
  let s = await readFile(new URL(`../supabase/functions/${nome}/index.ts`, import.meta.url), "utf8");
  const antes = s;
  s = s.replace(/import \{ createClient \} from "https:\/\/esm\.sh\/[^"]+";/,
    "const createClient = ((b) => () => b)(globalThis.__bancoSenha);");
  if (s === antes) throw new Error(`nao achei o import do createClient em ${nome}`);
  s = "const console = { ...globalThis.console, error: () => {}, warn: () => {} };\n" + s;
  const saida = await build({
    stdin: { contents: s, loader: "ts", resolveDir: fileURLToPath(new URL(`../supabase/functions/${nome}/`, import.meta.url)) },
    bundle: true, format: "esm", platform: "neutral", write: false, logLevel: "silent",
  });
  await import("data:text/javascript;base64," + Buffer.from(saida.outputFiles[0].text + "\n//" + Math.random()).toString("base64"));
  return {
    fetches,
    corpos,
    async chamar(token, corpo) {
      const headers = { "content-type": "application/json" };
      if (token) headers.authorization = `Bearer ${token}`;
      const r = await handler(new Request("https://teste.invalid", { method: "POST", headers, body: JSON.stringify(corpo) }));
      const texto = await r.text();
      return { status: r.status, headers: r.headers, texto, body: JSON.parse(texto) };
    },
  };
}

/** Tudo o que a function mandou gravar no log, e o que ela respondeu, num
 *  texto so: e nele que se procura a senha e o hash que nao podem aparecer. */
export const tudoQueSaiu = (banco, respostas) =>
  JSON.stringify(banco.tabelas.equipe_acessos_log) +
  JSON.stringify(banco.ops.filter((o) => o.tipo === "rpc" && o.nome === "porta_registrar")) +
  respostas.map((r) => r.texto).join("");
