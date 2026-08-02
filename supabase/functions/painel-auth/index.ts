// ============================================================================
// painel-auth — login do Painel de Gestao (substitui netlify/functions/auth.mjs)
//
// O CONTRATO E O MESMO: { action, ... } e as mesmas respostas. So o backend
// mudou -- store "painel-auth" (1 blob por conta) -> tabela painel_contas.
//
// O painel NAO usa Supabase Auth de proposito: ele ja tem login proprio com
// permissao por modulo, e o hash das senhas (PBKDF2, 120 mil iteracoes) fica em
// painel_contas. Trocar isso agora significaria todo mundo recriar senha sem
// ganho nenhum -- e reescrever mecanismo de senha e a forma mais facil de
// enfraquecer um. O modulo _shared/cripto.ts e copia fiel do que roda hoje.
//
// PROJETO COMPARTILHADO: prefixo obrigatorio. "auth" seria uma function generica
// demais num projeto que hospeda cinco sistemas.
//
// verify_jwt = false: quem valida o cracha e esta funcao, com o JWT_SECRET
// proprio do painel. O gateway do Supabase nao conhece esse cracha.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  assinarJwt, hashSenha, conferirSenha, normalizarUsuario, sessaoDoPedido,
} from "../_shared/cripto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";
const TOKEN = Deno.env.get("PAINEL_TOKEN") ?? "";
const MASTER_USUARIO = normalizarUsuario(Deno.env.get("PAINEL_AUTH_MASTER_USUARIO") || "leonardo");
const MASTER_SENHA = Deno.env.get("PAINEL_AUTH_MASTER_SENHA") ?? "";

const EXP_SEG = 60 * 60 * 12; // cracha vale 12 horas

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Modulos que podem ser liberados. "inicio" nao entra: e a porta de entrada e
// fica sempre acessivel, senao a pessoa loga e cai numa tela sem lugar nenhum.
const MODULOS = ["contas-atrasadas", "fluxo-caixa", "produtos", "orcamentos", "bancos", "marketing", "configuracoes"];

// Mensagem UNICA para qualquer falha de login: usuario inexistente e senha
// errada precisam ser indistinguiveis, senao da para descobrir quem tem acesso.
// (Confirmado atacando o sistema no ar em 2026-07-22.)
const ERRO_LOGIN = "Usuario ou senha incorretos.";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "content-type": "application/json" } });

// Comparacao em tempo constante (nao vaza o tamanho do acerto).
function igual(a: unknown, b: unknown): boolean {
  const x = String(a), y = String(b);
  let dif = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) dif |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return dif === 0;
}

async function lerConta(usuario: string) {
  const { data } = await sb.from("painel_contas").select("*").eq("usuario", usuario).maybeSingle();
  return data;
}

// Tira hash/salt antes de devolver uma conta para a tela.
const publica = (c: any) => ({
  usuario: c.usuario,
  nome: c.nome || c.usuario,
  permissoes: c.permissoes || [],
  vendedorId: c.vendedor_id || "",
  atualizadoEm: c.atualizado_em,
});

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "Use POST." }, 405);
  if (!JWT_SECRET) return json({ erro: "Login nao configurado (falta PAINEL_JWT_SECRET).", semConfig: true }, 501);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ erro: "JSON invalido." }, 400);
  }
  const action = String(body.action || "");

  const exigirMaster = async () => {
    const s = await sessaoDoPedido(req, JWT_SECRET);
    return s && s.master === true ? s : null;
  };

  try {
    switch (action) {
      // Diz se o ambiente esta montado, NUNCA os valores. Existe porque "senha
      // incorreta" tem duas causas muito diferentes -- senha errada de verdade,
      // ou a variavel invisivel para a funcao -- e sem isto nao da para separar.
      case "diag": {
        if (!TOKEN || req.headers.get("x-token") !== TOKEN) return json({ erro: "nao autorizado" }, 401);
        const { count } = await sb.from("painel_contas").select("usuario", { count: "exact", head: true });
        return json({
          temJwtSecret: !!JWT_SECRET,
          temMasterSenha: !!MASTER_SENHA,
          usuarioMaster: MASTER_USUARIO,
          contaMasterJaGravada: !!(await lerConta(MASTER_USUARIO)),
          totalContas: count ?? 0,
        });
      }

      case "login": {
        const usuario = normalizarUsuario(body.usuario);
        const senha = String(body.senha || "");
        if (!usuario || !senha) return json({ erro: "Informe usuario e senha." }, 400);

        if (usuario === MASTER_USUARIO) {
          const propria = await lerConta(MASTER_USUARIO);
          // A senha do ambiente e apenas a INICIAL: assim que a direcao troca a
          // senha dentro do painel, passa a valer a conta gravada -- a senha
          // definitiva nunca fica escrita numa configuracao.
          const ok = propria
            ? await conferirSenha(senha, propria)
            : !!MASTER_SENHA && igual(senha, MASTER_SENHA);
          if (!ok) return json({ erro: ERRO_LOGIN }, 401);
          const token = await assinarJwt(
            { sub: MASTER_USUARIO, nome: propria?.nome || "Direcao", master: true, perms: ["*"], vend: "" },
            JWT_SECRET, EXP_SEG);
          return json({
            token, usuario: MASTER_USUARIO, nome: propria?.nome || "Direcao",
            permissoes: ["*"], master: true, vendedorId: "",
            trocarSenha: !propria, // avisa a tela para pedir a troca da senha inicial
          });
        }

        const conta = await lerConta(usuario);
        if (!conta || !(await conferirSenha(senha, conta))) return json({ erro: ERRO_LOGIN }, 401);
        const perms = conta.permissoes || [];
        const vend = conta.vendedor_id || "";
        const token = await assinarJwt(
          { sub: conta.usuario, nome: conta.nome, master: false, perms, vend }, JWT_SECRET, EXP_SEG);
        return json({
          token, usuario: conta.usuario, nome: conta.nome,
          permissoes: perms, master: false, vendedorId: vend,
        });
      }

      case "eu": {
        const s = await sessaoDoPedido(req, JWT_SECRET);
        if (!s) return json({ erro: "Sessao invalida ou expirada." }, 401);
        return json({
          usuario: s.sub, nome: s.nome || s.sub,
          permissoes: s.perms || [], master: s.master === true, vendedorId: s.vend || "",
        });
      }

      // Exige a senha atual: um cracha roubado nao pode tomar a conta.
      case "trocarMinhaSenha": {
        const s = await sessaoDoPedido(req, JWT_SECRET);
        if (!s?.sub) return json({ erro: "Entre no sistema para trocar sua senha." }, 401);
        const atual = String(body.senhaAtual || "");
        const nova = String(body.novaSenha || "");
        if (nova.length < 6) return json({ erro: "A nova senha precisa ter ao menos 6 caracteres." }, 400);

        const chave = normalizarUsuario(s.sub);
        const conta = await lerConta(chave);
        const ehMaster = s.master === true;

        // Saida so para a DIRECAO ja logada: definir a senha sem lembrar a
        // anterior. Quem esta com essa sessao na mao ja abre tudo no painel --
        // inclusive backup e restauracao --, entao exigir a senha atual aqui
        // protegeria pouco e travaria o dono do sistema para fora. Para as
        // demais contas a senha atual continua obrigatoria: a direcao redefine
        // a senha delas pela tela de acessos.
        const semAtual = body.semSenhaAtual === true && ehMaster;
        const confere = semAtual
          ? true
          : conta
            ? await conferirSenha(atual, conta)
            : ehMaster && !!MASTER_SENHA && igual(atual, MASTER_SENHA);
        if (!confere) return json({ erro: "Senha atual incorreta." }, 401);

        const reg = await hashSenha(nova);
        const { error } = await sb.from("painel_contas").upsert({
          usuario: chave,
          nome: conta?.nome || (ehMaster ? "Direcao" : chave),
          permissoes: ehMaster ? ["*"] : conta?.permissoes || [],
          vendedor_id: conta?.vendedor_id || "",
          ...reg,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: "usuario" });
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }

      case "listarContas": {
        if (!(await exigirMaster())) return json({ erro: "Apenas a direcao." }, 403);
        const { data, error } = await sb.from("painel_contas").select("*").order("usuario");
        if (error) throw new Error(error.message);
        return json({ contas: (data ?? []).map(publica), modulos: MODULOS, master: MASTER_USUARIO });
      }

      case "salvarConta": {
        if (!(await exigirMaster())) return json({ erro: "Apenas a direcao." }, 403);
        const usuario = normalizarUsuario(body.usuario);
        const nome = String(body.nome || "").trim() || usuario;
        const senha = body.senha ? String(body.senha) : "";
        const permissoes = Array.isArray(body.permissoes)
          ? body.permissoes.filter((p: string) => p === "*" || MODULOS.includes(p))
          : [];
        if (!usuario) return json({ erro: "Informe o usuario." }, 400);
        if (usuario === MASTER_USUARIO) {
          // Nao e limitacao, e desenho: a direcao ja entra e ja ve tudo, entao
          // cadastra-la de novo criaria duas contas com o mesmo nome disputando
          // o login. A senha dela se troca em "Minha senha", dentro do painel.
          return json({
            erro: "Essa e a conta da direcao: ela ja entra e ja enxerga tudo. Para trocar a senha dela, use 'Minha senha' no alto desta pagina.",
          }, 400);
        }

        const atual = await lerConta(usuario);
        // Conta nova exige senha; conta existente pode ser editada sem trocar a
        // senha (campo em branco = mantem a que ja tem).
        if (!atual && senha.length < 6) return json({ erro: "Defina uma senha de ao menos 6 caracteres." }, 400);
        if (senha && senha.length < 6) return json({ erro: "A senha precisa ter ao menos 6 caracteres." }, 400);

        const reg = senha
          ? await hashSenha(senha)
          : { hash: atual!.hash, salt: atual!.salt, iter: atual!.iter };
        // Campo ausente no corpo = mantem o que ja estava; string vazia = desliga.
        const vendedorId = body.vendedorId === undefined
          ? atual?.vendedor_id || ""
          : String(body.vendedorId || "").trim();

        const { error } = await sb.from("painel_contas").upsert({
          usuario, nome, permissoes, vendedor_id: vendedorId, ...reg,
          atualizado_em: new Date().toISOString(),
        }, { onConflict: "usuario" });
        if (error) throw new Error(error.message);
        return json({ ok: true });
      }

      case "removerConta": {
        if (!(await exigirMaster())) return json({ erro: "Apenas a direcao." }, 403);
        const usuario = normalizarUsuario(body.usuario);
        if (!usuario) return json({ erro: "Informe o usuario." }, 400);
        if (usuario === MASTER_USUARIO) return json({ erro: "A conta da direcao nao pode ser removida." }, 400);
        await sb.from("painel_contas").delete().eq("usuario", usuario);
        return json({ ok: true });
      }

      default:
        return json({ erro: `Acao desconhecida: ${action}` }, 400);
    }
  } catch (e) {
    console.error("[painel-auth] erro:", e);
    return json({ erro: "Falha interna no login." }, 500);
  }
});
