// ============================================================================
// acesso-entrar — A ENTRADA UNICA da Impresilk.
//
// Uma pessoa digita usuario e senha UMA vez e sai daqui com o cracha de cada
// sistema a que tem direito. Pode ser chamada de qualquer porta: da tela do
// Painel ou da tela de login de qualquer um dos sete -- as duas portas
// continuam existindo, era condicao do dono.
//
// POR QUE ESTE DESENHO, e nao trocar a autenticacao dos sete de uma vez:
// cada sistema JA sabe conferir um cracha. Emitindo aqui os crachas que eles ja
// entendem, a virada nao encosta em nenhuma das 12 functions de dados nem nas
// telas deles. Se algo der errado, o estrago e nesta function -- e a porta
// antiga de cada sistema continua de pe ate ser desligada de proposito.
//
// A IDENTIDADE PASSA A SER O SUPABASE AUTH. A senha mora la (bcrypt do GoTrue),
// nao mais em duas tabelas nossas.
//
// MIGRACAO NA PRIMEIRA ENTRADA. O GoTrue nao aceita hash PBKDF2 importado --
// entao ninguem poderia "levar" a senha antiga. A saida: na primeira vez, a
// pessoa digita a senha de sempre, ESTA function confere contra o hash antigo
// (acesso_senha_legado) e, batendo, grava a MESMA senha no Supabase Auth. Da
// segunda vez em diante quem confere e o GoTrue. Ninguem recria senha e ninguem
// percebe a virada.
//
// UMA LINHA POR ORIGEM, de proposito: a Barbara tem senhas DIFERENTES no Brief
// e no POPs; o dono tem cinco. Qualquer uma delas serve na primeira entrada, e
// a que ela digitar vira a unica. Escolher por ela seria trancar metade da
// equipe do lado de fora.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assinarJwt, hashSenha, conferirSenha, normalizarUsuario } from "../_shared/cripto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// ANON_KEY_IMPRESILK, e nao SUPABASE_ANON_KEY: o prefixo SUPABASE_ e reservado
// pela plataforma e um secret com esse nome e recusado (HTTP 400).
const ANON_KEY = Deno.env.get("ANON_KEY_IMPRESILK") ?? "";
// Os dois segredos que os sistemas ja usam. Esta function e a UNICA que precisa
// dos dois ao mesmo tempo -- e por isso que ela e a ponte.
const EQUIPE_SECRET = Deno.env.get("EQUIPE_JWT_SECRET") ?? "";
const PAINEL_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";

// E-mail sintetico: ninguem aqui tem e-mail corporativo, entao o endereco e so
// a chave que o GoTrue exige -- NAO da para recuperar senha por e-mail, e a
// tela nao promete isso.
//
// O RH JA CRIOU usuarios no mesmo Auth. Criar outro para a mesma pessoa faria
// dela DUAS identidades -- e a do RH continuaria com a senha velha, exatamente
// o problema que esta virada existe para acabar.
//
// A ligacao NAO e adivinhada pelo e-mail: o endereco do RH vem do que a pessoa
// digitou no login dela ("leonardo", "leonardo goncalves"), nao do nome do
// cadastro, entao montar o endereco a partir do nome erra. Quem sabe a ligacao
// e a tabela `perfis` do RH, que guarda user_id + nome do colaborador.
const DOMINIO = "impresilk.local";
const emailDe = (usuario: string) => `${usuario}@${DOMINIO}`;
const semAcento = (t: string) =>
  String(t ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();

const DIAS_EQUIPE = 30;   // o mesmo prazo que a equipe-auth usa
const HORAS_PAINEL = 12;  // o mesmo prazo que a painel-auth usa

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// Mensagem UNICA para qualquer falha: usuario inexistente e senha errada
// precisam ser indistinguiveis, senao da para descobrir quem trabalha aqui.
const ERRO = "Usuario ou senha incorretos.";
// Registro de mentira, so para gastar o mesmo tempo quando a conta nao existe
// (o PBKDF2 de 120 mil voltas leva ~100 ms; responder na hora denuncia).
const FANTASMA = { hash: "0".repeat(64), salt: "00112233445566778899aabbccddeeff", iter: 120000 };

const enc = new TextEncoder();
const b64url = (b: Uint8Array) => {
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const b64urlTexto = (t: string) => b64url(enc.encode(t));

// Cracha no formato EXATO que a equipe-auth emite -- e ela que os cinco
// sistemas conferem. Mudar um campo aqui quebra os cinco de uma vez.
async function crachaEquipe(sistema: string, usuario: string, nome: string, papel: string) {
  const agora = Math.floor(Date.now() / 1000);
  const corpo = { sis: sistema, sub: usuario, nome, papel, iat: agora, exp: agora + DIAS_EQUIPE * 86400 };
  const cab = b64urlTexto(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const meio = `${cab}.${b64urlTexto(JSON.stringify(corpo))}`;
  const chave = await crypto.subtle.importKey(
    "raw", enc.encode(EQUIPE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", chave, enc.encode(meio)));
  return `${meio}.${b64url(sig)}`;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);
  if (!EQUIPE_SECRET || !PAINEL_SECRET || !ANON_KEY) {
    return json({ erro: "Entrada nao configurada no servidor." }, 503);
  }

  let corpo: any = {};
  try {
    corpo = await req.json();
  } catch {
    return json({ erro: "json invalido" }, 400);
  }
  if (corpo.action !== "entrar") return json({ erro: "acao desconhecida" }, 400);

  const usuario = normalizarUsuario(corpo.usuario);
  const senha = String(corpo.senha ?? "");
  if (!usuario || !senha) return json({ erro: "Informe usuario e senha." }, 400);

  try {
    const { data: conta } = await sb.from("acesso_conta")
      .select("*").eq("usuario", usuario).maybeSingle();

    // Conta inexistente ainda paga o preco do PBKDF2 (ver FANTASMA).
    if (!conta || conta.ativo === false) {
      await conferirSenha(senha, FANTASMA);
      return json({ erro: ERRO }, 401);
    }

    // Esta pessoa ja tem usuario no Auth pela via do RH? Se tem, e ELE que vale.
    // Pode haver MAIS DE UM (o RH cria um por grafia digitada: hoje o Leonardo
    // tem dois). Ordena do mais recente para o mais antigo e deixa a senha
    // digitada decidir qual e o de verdade -- adivinhar aqui erraria calado.
    let email = emailDe(usuario);
    const candidatos: { id: string; email: string }[] = [];
    if (!conta.auth_user_id && conta.colaborador) {
      const { data: perfis } = await sb.from("perfis").select("user_id, nome, atualizado_em");
      const alvo = semAcento(conta.colaborador);
      const meus = (perfis ?? [])
        .filter((p: any) => semAcento(p.nome) === alvo)
        .sort((a: any, b: any) => String(b.atualizado_em).localeCompare(String(a.atualizado_em)));
      for (const p of meus) {
        const { data: u } = await sb.auth.admin.getUserById(p.user_id);
        if (u?.user?.email) candidatos.push({ id: p.user_id, email: u.user.email });
      }
      if (candidatos.length) email = candidatos[0].email;
    }
    let sessao: any = null;

    // 1) Ja migrada? Quem confere e o GoTrue.
    const cliente = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    if (conta.auth_user_id) {
      const { data, error } = await cliente.auth.signInWithPassword({ email, password: senha });
      if (error || !data?.session) return json({ erro: ERRO }, 401);
      sessao = data.session;
    } else {
      // 2a) A senha do RH nao esta em acesso_senha_legado: ela mora no GoTrue,
      //     em bcrypt, ilegivel para mim. Entao, para quem ja tem usuario la, a
      //     senha do RH e tentada PRIMEIRO -- batendo, a conta e so adotada, sem
      //     trocar senha nenhuma. Sem isto, quem digitasse a senha do RH (a mais
      //     provavel, e a que ele usa todo dia) ouviria "senha incorreta".
      for (const c of candidatos) {
        const { data: d0 } = await cliente.auth.signInWithPassword({ email: c.email, password: senha });
        if (!d0?.session) continue;
        email = c.email;
        await sb.from("acesso_conta")
          .update({ auth_user_id: d0.session.user.id, atualizado_em: new Date().toISOString() })
          .eq("id", conta.id);
        await sb.from("acesso_senha_legado")
          .update({ usado_em: new Date().toISOString() }).eq("conta_id", conta.id);
        conta.auth_user_id = d0.session.user.id;
        sessao = d0.session;
        break;
      }

      // 2b) Primeira entrada: confere contra os hashes antigos. QUALQUER um
      //     serve -- a pessoa pode ter senhas diferentes por sistema.
      const { data: legados } = sessao ? { data: [] } : await sb.from("acesso_senha_legado")
        .select("origem, hash, salt, iter").eq("conta_id", conta.id);
      const lista = legados ?? [];
      let bateu = !!sessao;
      for (const l of lista) {
        if (await conferirSenha(senha, l)) { bateu = true; break; }
      }
      if (!bateu) {
        if (!lista.length) await conferirSenha(senha, FANTASMA);
        return json({ erro: ERRO }, 401);
      }

      // Bateu por hash antigo: a senha que a pessoa acabou de digitar vira a do
      // Supabase Auth. (Se ja adotou o usuario do RH acima, nada disto roda --
      // trocar a senha do RH pela do outro sistema seria recriar senha na marra.)
      if (!sessao) {
      const { data: criado, error: erroCriar } = await sb.auth.admin.createUser({
        email, password: senha, email_confirm: true,
        user_metadata: { usuario, nome: conta.nome },
      });
      let idAuth = criado?.user?.id ?? null;
      if (erroCriar && !idAuth) {
        // Ja existia no GoTrue (conta do RH, ou uma tentativa anterior que
        // gravou o usuario e morreu antes de marcar a conta): acha e troca a
        // senha para a que acabou de ser conferida.
        const { data: lista2 } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const achado = (lista2?.users ?? []).find((u: any) => u.email === email);
        if (!achado) throw new Error(erroCriar.message);
        idAuth = achado.id;
        await sb.auth.admin.updateUserById(idAuth, { password: senha });
      }

      await sb.from("acesso_conta").update({ auth_user_id: idAuth, atualizado_em: new Date().toISOString() })
        .eq("id", conta.id);
      // Marca as senhas antigas como usadas. Elas viram lixo a partir daqui --
      // hash de senha nao e coisa para ficar guardada "por via das duvidas".
      await sb.from("acesso_senha_legado")
        .update({ usado_em: new Date().toISOString() }).eq("conta_id", conta.id);

      const { data, error } = await cliente.auth.signInWithPassword({ email, password: senha });
      if (error || !data?.session) return json({ erro: ERRO }, 401);
      sessao = data.session;
      conta.auth_user_id = idAuth;
      }
    }

    // 3) Os crachas de cada sistema a que ela tem direito.
    const { data: papeis } = await sb.from("acesso_papel")
      .select("*").eq("conta_id", conta.id).eq("ativo", true);

    const crachas: Record<string, unknown> = {};
    for (const p of papeis ?? []) {
      if (p.sistema === "painel") {
        const perms = Array.isArray(p.permissoes) ? p.permissoes : [];
        crachas.painel = {
          token: await assinarJwt(
            { sub: usuario, nome: conta.nome || usuario, master: perms.includes("*"),
              perms, vend: p.vendedor_id || "" },
            PAINEL_SECRET, HORAS_PAINEL * 3600),
          usuario, nome: conta.nome || usuario, permissoes: perms,
          master: perms.includes("*"), vendedorId: p.vendedor_id || "",
        };
      } else if (p.sistema !== "rh") {
        // RH fica de fora: la o cracha JA e o do Supabase Auth, que vai inteiro
        // na resposta. Emitir um cracha nosso para ele seria inventar um
        // terceiro mecanismo justamente onde ja existe o certo.
        crachas[p.sistema] = {
          token: await crachaEquipe(p.sistema, usuario, conta.nome || usuario, p.papel || ""),
          papel: p.papel || "",
        };
      }
    }

    return json({
      ok: true,
      usuario, nome: conta.nome || usuario, tipo: conta.tipo,
      // A sessao do Supabase Auth: e ela que o RH usa, e e ela que um dia vai
      // substituir os crachas dos outros seis.
      sessao: { access_token: sessao.access_token, refresh_token: sessao.refresh_token, expires_at: sessao.expires_at },
      crachas,
      sistemas: Object.keys(crachas).concat((papeis ?? []).some((p: any) => p.sistema === "rh") ? ["rh"] : []),
    });
  } catch (e) {
    console.error("[acesso-entrar] erro:", e);
    return json({ erro: "Falha interna na entrada." }, 500);
  }
});
