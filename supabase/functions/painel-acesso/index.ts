// ============================================================================
// painel-acesso — quem entra nos SETE sistemas, num lugar so.
//
// Le e escreve acesso_conta / acesso_papel, as tabelas que consolidam
// equipe_contas (uma linha por pessoa POR SISTEMA) e painel_contas.
//
// ATENCAO AO QUE ESTA FUNCTION *NAO* FAZ: ela nao decide login nenhum ainda.
// Quem manda nos logins de hoje continua sendo equipe_contas e painel_contas.
// Isto aqui e a PREPARACAO da virada -- a tela diz isso com todas as letras,
// senao a direcao mexe aqui, acha que tirou o acesso de alguem, e nao tirou.
//
// So a direcao entra. Nao ha leitura para gestor nem para colaborador: a lista
// de quem entra em que sistema e, por si so, um mapa de onde bater.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verificarJwt } from "../_shared/cripto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const texto = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

// Os sete sistemas da casa. Lista fechada: sistema digitado errado viraria uma
// linha de papel que nenhuma tela le e ninguem descobre.
const SISTEMAS = ["painel", "rh", "pcp", "brief", "dre", "compras", "pops"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "use POST" }, 405);
  if (!JWT_SECRET) return resposta({ erro: "Login nao configurado no servidor." }, 503);

  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const sessao = m ? await verificarJwt(m[1], JWT_SECRET) : null;
  if (!sessao) return resposta({ erro: "Entre no sistema.", semSessao: true }, 401);
  const perms: string[] = Array.isArray(sessao.perms) ? sessao.perms : [];
  if (sessao.master !== true && !perms.includes("*")) {
    return resposta({ erro: "Apenas a direcao." }, 403);
  }

  let corpo: any = {};
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: "json invalido" }, 400);
  }

  const contaPorUsuario = async (usuario: string) => {
    const { data } = await sb.from("acesso_conta").select("id")
      .eq("usuario", texto(usuario, 60).toLowerCase()).maybeSingle();
    return data?.id ?? null;
  };

  try {
    switch (corpo.action) {
      case "listar": {
        const { data: contas } = await sb.from("acesso_conta").select("*").order("usuario");
        const { data: papeis } = await sb.from("acesso_papel").select("*");
        // O hash NUNCA sai daqui -- so a contagem, para a tela poder dizer
        // "esta pessoa ainda nao entrou depois da virada".
        const { data: senhas } = await sb.from("acesso_senha_legado")
          .select("conta_id, origem, usado_em");

        // Nomes do RH para o campo de amarrar. So o NOME: a ficha de la tem
        // salario, CPF e endereco, e nada disso tem o que fazer nesta tela.
        const { data: colabs } = await sb.from("registros")
          .select("registro").eq("colecao", "colaboradores");
        const nomes = [...new Set((colabs ?? [])
          .map((r: any) => String(r.registro?.nome ?? "").trim())
          .filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));

        return resposta({
          ok: true,
          sistemas: SISTEMAS,
          contas: (contas ?? []).map((c: any) => ({
            ...c,
            papeis: (papeis ?? []).filter((p: any) => p.conta_id === c.id),
            senhas: (senhas ?? []).filter((s: any) => s.conta_id === c.id)
              .map((s: any) => ({ origem: s.origem, migrada: !!s.usado_em })),
          })),
          colaboradores: nomes,
        });
      }

      case "salvarConta": {
        const c = corpo.conta ?? {};
        const usuario = texto(c.usuario, 60).toLowerCase();
        if (!usuario) return resposta({ erro: "Informe o usuario." }, 400);
        if (!/^[a-z0-9._-]+$/.test(usuario)) {
          return resposta({ erro: "O usuario aceita so letras sem acento, numeros, ponto, hifen e sublinhado." }, 400);
        }
        const linha: any = {
          usuario,
          nome: texto(c.nome, 120) || usuario,
          tipo: c.tipo === "funcao" ? "funcao" : "pessoa",
          colaborador: texto(c.colaborador, 160),
          ativo: c.ativo !== false,
          atualizado_em: new Date().toISOString(),
        };
        const { data, error } = await sb.from("acesso_conta")
          .upsert(linha, { onConflict: "usuario" }).select().single();
        if (error) throw new Error(error.message);
        return resposta({ ok: true, conta: data });
      }

      case "salvarPapel": {
        const p = corpo.papel ?? {};
        const sistema = texto(p.sistema, 20);
        if (!SISTEMAS.includes(sistema)) return resposta({ erro: "Sistema desconhecido." }, 400);
        const id = await contaPorUsuario(p.usuario);
        if (!id) return resposta({ erro: "Conta nao encontrada." }, 404);
        const { error } = await sb.from("acesso_papel").upsert({
          conta_id: id,
          sistema,
          papel: texto(p.papel, 40),
          permissoes: Array.isArray(p.permissoes) ? p.permissoes : [],
          vendedor_id: texto(p.vendedorId, 120),
          ativo: p.ativo !== false,
        }, { onConflict: "conta_id,sistema" });
        if (error) throw new Error(error.message);
        return resposta({ ok: true });
      }

      case "removerPapel": {
        const id = await contaPorUsuario(corpo.usuario);
        const sistema = texto(corpo.sistema, 20);
        if (!id || !SISTEMAS.includes(sistema)) return resposta({ erro: "Pedido invalido." }, 400);
        await sb.from("acesso_papel").delete().eq("conta_id", id).eq("sistema", sistema);
        return resposta({ ok: true });
      }

      // Nao existe "remover conta" de proposito. Enquanto equipe_contas e
      // painel_contas mandam nos logins, apagar aqui daria a ilusao de ter
      // tirado o acesso de alguem que continua entrando. Para tirar de
      // verdade, hoje, e nas tabelas antigas -- e a tela diz isso.
      default:
        return resposta({ erro: "acao desconhecida" }, 400);
    }
  } catch (e) {
    console.error("[painel-acesso] erro:", e);
    return resposta({ erro: "erro interno" }, 500);
  }
});
