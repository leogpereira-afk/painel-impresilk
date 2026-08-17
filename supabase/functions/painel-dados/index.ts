// ============================================================================
// painel-dados — leituras do Painel (substitui contas-atrasadas.js,
// fluxo-caixa.js, produtos.js e orcamentos.js)
//
// As quatro faziam a MESMA coisa: conferir o cracha, ler uma chave do cache e
// devolver { itens, atualizadoEm }. Viraram uma function com ?modulo=, porque
// quatro copias do mesmo porteiro sao quatro lugares para ele sair diferente.
//
// O cache e preenchido por FORA (GitHub Actions -- ver .github/workflows/
// cache-mubisys.yml). Aqui so se le: resposta instantanea, e a normalizacao dos
// campos continua vivendo em quem carrega.
//
// PORTEIRO FAIL-CLOSED: sem PAINEL_JWT_SECRET no ambiente, tudo trava em vez de
// liberar. Um painel financeiro fora do ar e um problema; um painel financeiro
// aberto e outro bem maior. (Antes do porteiro, qualquer um com o endereco lia
// 225 titulos, 1.479 O.S e 2.545 orcamentos -- conferido em 2026-07-22.)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verificarJwt, crachaRevogado } from "../_shared/cripto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";

// Opcional: token do GitHub com permissao de Actions. Se existir, uma leitura
// com cache velho dispara a recarga (auto-cura). Sem ele, vale so o agendamento
// -- que e o caso normal. A auto-cura existe porque o cron do Netlify ja congelou
// por 11 horas e ninguem percebeu ate abrir o painel.
const GH_TOKEN = Deno.env.get("PAINEL_GH_ACTIONS_TOKEN") ?? "";
const GH_REPO = Deno.env.get("PAINEL_GH_REPO") ?? "leogpereira-afk/painel-impresilk";
const MINUTOS_ATE_AQUECER = 22;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...CORS, "content-type": "application/json" } });

// Porteiro: cracha valido E permissao para o modulo pedido.
async function exigirSessao(req: Request, modulo: string) {
  if (!JWT_SECRET) {
    console.error("painel-dados: PAINEL_JWT_SECRET ausente -- recusando tudo (fail-closed)");
    return { resposta: json({ erro: "Login nao configurado no servidor." }, 503) };
  }
  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const s = m ? await verificarJwt(m[1], JWT_SECRET) : null;
  if (s && await crachaRevogado(sb, "painel", s)) return null;
  if (!s) return { resposta: json({ erro: "Entre no sistema.", semSessao: true }, 401) };
  const perms: string[] = s.perms || [];
  const pode = s.master === true || perms.includes("*") || perms.includes(modulo);
  if (!pode) return { resposta: json({ erro: "Voce nao tem acesso a este modulo." }, 403) };
  return { sessao: s };
}

const lerCache = async (chave: string) => {
  const { data } = await sb.from("painel_cache").select("valor").eq("chave", chave).maybeSingle();
  return data?.valor ?? null;
};

/* O MESMO valor, mais a data em que ELE foi gravado.
   Funcao separada de proposito: mudar a forma de retorno do `lerCache` quebraria
   em silencio tres chamadas (talvezAquecer le status.em; o fluxo mensal le
   mensal.em; e `dsoHist` iria embrulhado, sendo que o front faz
   `Array.isArray(body.dsoHist)` e descartaria a curva inteira sem erro nenhum).

   POR QUE ISTO IMPORTA: os cinco modulos devolviam o carimbo GLOBAL, lido da
   chave `status`, que ganha data nova em todo ciclo em que ALGUMA fonte veio.
   A fonte que falhou ficava com o dado velho e o carimbo novo -- carga parcial
   aparecia como verde. A coluna certa sempre existiu (`painel_cache
   .atualizado_em`, escrita em todo upsert) e era descartada no `select`. */
const lerCacheComData = async (chave: string): Promise<{ valor: any; em: string | null }> => {
  const { data } = await sb
    .from("painel_cache").select("valor, atualizado_em").eq("chave", chave).maybeSingle();
  return { valor: data?.valor ?? null, em: data?.atualizado_em ?? null };
};

// Dispara a recarga se o cache estiver velho. Fire-and-forget: a leitura NUNCA
// espera por isto -- quem abriu o painel quer o dado que ja existe, mesmo velho.
function talvezAquecer(status: any) {
  try {
    if (!GH_TOKEN) return; // sem token de Actions: vale so o agendamento
    const em = status?.em ? new Date(status.em).getTime() : 0;
    if (em && Date.now() - em < MINUTOS_ATE_AQUECER * 60000) return;
    fetch(`https://api.github.com/repos/${GH_REPO}/actions/workflows/cache-mubisys.yml/dispatches`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "painel-impresilk",
      },
      body: JSON.stringify({ ref: "main" }),
    }).catch(() => {});
  } catch { /* auto-cura nunca derruba a leitura */ }
}

const PRECISA_AQUECER = {
  preparando: true,
  erro: "Cache do Mubisys ainda nao aquecido. Aguarde uns 2 minutos.",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const url = new URL(req.url);
  const modulo = url.searchParams.get("modulo") ?? "";
  const parte = url.searchParams.get("parte") ?? "pagar";

  try {
    switch (modulo) {
      case "contas-atrasadas": {
        const g = await exigirSessao(req, "contas-atrasadas");
        if (g.resposta) return g.resposta;
        const [rec, status, dsoHist] = await Promise.all([
          lerCacheComData("recebiveis"), lerCache("status"), lerCache("dso_hist"),
        ]);
        talvezAquecer(status);
        if (!rec.valor) return json(PRECISA_AQUECER, 503);
        // Carimbo DESTA chave, com o global como reserva (linha nunca tocada
        // desde antes da coluna existir).
        return json({ itens: rec.valor, atualizadoEm: rec.em ?? status?.em ?? null, dsoHist: dsoHist ?? [] });
      }

      case "fluxo-caixa": {
        const g = await exigirSessao(req, "fluxo-caixa");
        if (g.resposta) return g.resposta;

        // Realizado mes a mes: forma diferente (por ano), responde separado.
        if (parte === "mensal") {
          const [mensal, status] = await Promise.all([lerCache("fluxo_mensal"), lerCache("status")]);
          talvezAquecer(status);
          // Ainda nao rodou a carga do realizado: nao e erro, so nao ha historico.
          if (!mensal) return json({ anos: {}, disponiveis: [], atualizadoEm: null, preparando: true });
          return json({
            anos: mensal.anos ?? {},
            disponiveis: mensal.disponiveis ?? [],
            atualizadoEm: mensal.em ?? status?.em ?? null,
          });
        }

        const [fonte, status] = await Promise.all([
          lerCacheComData(parte === "bancos" ? "bancos" : "pagar"), lerCache("status"),
        ]);
        talvezAquecer(status);
        if (!fonte.valor) return json(PRECISA_AQUECER, 503);
        return json({ itens: fonte.valor, atualizadoEm: fonte.em ?? status?.em ?? null });
      }

      case "produtos": {
        const g = await exigirSessao(req, "produtos");
        if (g.resposta) return g.resposta;
        const [os, status] = await Promise.all([lerCacheComData("ordens"), lerCache("status")]);
        talvezAquecer(status);
        if (!os.valor) return json(PRECISA_AQUECER, 503);
        return json({ itens: os.valor, atualizadoEm: os.em ?? status?.em ?? null });
      }

      case "orcamentos": {
        const g = await exigirSessao(req, "orcamentos");
        if (g.resposta) return g.resposta;
        const [orc, status] = await Promise.all([lerCacheComData("orcamentos"), lerCache("status")]);
        talvezAquecer(status);
        if (!orc.valor) return json(PRECISA_AQUECER, 503);
        return json({ itens: orc.valor, atualizadoEm: orc.em ?? status?.em ?? null });
      }

      default:
        return json({ erro: `Modulo desconhecido: ${modulo || "(vazio)"}` }, 400);
    }
  } catch (e) {
    console.error("[painel-dados] erro:", e);
    return json({ erro: "Erro interno." }, 500);
  }
});
