// ============================================================================
// painel-cache — recebe o cache do Mubisys ja pronto e grava.
//
// POR QUE ESTA FUNCAO EXISTE (e nao a carga inteira aqui dentro):
// buscar o ano no Mubisys leva MINUTOS -- a API responde em 25-40s por chamada
// e sao muitas. Edge Function morre em 150s. Entao a parte lenta roda no GitHub
// Actions (sem limite de tempo) e manda o resultado PRONTO para ca; gravar e
// instantaneo.
//
// E, principalmente: assim a chave-mestra do banco (service_role) NUNCA sai do
// Supabase. O GitHub so conhece o PAINEL_TOKEN, que autoriza gravar cache --
// dado descartavel, que se reconstroi sozinho. Se ele vazar, o estrago e alguem
// escrever numeros errados no cache ate a proxima carga; nao e acesso ao banco.
//
// Uma chave por chamada, de proposito: o corpo fica pequeno e uma fonte que
// falhou no Actions simplesmente nao manda a dela -- as outras seguem.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TOKEN = Deno.env.get("PAINEL_TOKEN") ?? "";

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "content-type": "application/json" } });

// So o que a carga escreve. Lista fechada para um token vazado nao poder criar
// chave nova nem sobrescrever coisa que nao e cache.
const CHAVES = new Set([
  "recebiveis", "pagar", "bancos", "orcamentos", "ordens",
  "fluxo_mensal", "status", "dso_hist", "lock",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);
  if (!TOKEN || req.headers.get("x-token") !== TOKEN) return json({ erro: "nao autorizado" }, 401);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ erro: "json invalido" }, 400);
  }

  // Leitura. O Actions consulta o "status" para decidir entre carga completa e
  // incremental, e na incremental precisa do cache ATUAL de orcamentos/ordens
  // para mesclar a janela de 7 dias em cima -- sem isso, a carga leve apagaria
  // o historico em vez de atualizar a ponta.
  if (body.action === "ler") {
    const chaveLida = String(body.chave ?? "status");
    if (!CHAVES.has(chaveLida)) return json({ erro: `chave nao permitida: ${chaveLida}` }, 400);
    const { data } = await sb.from("painel_cache").select("valor").eq("chave", chaveLida).maybeSingle();
    // "status" volta com o nome antigo para nao quebrar quem ja chama assim.
    return chaveLida === "status"
      ? json({ status: data?.valor ?? null })
      : json({ chave: chaveLida, valor: data?.valor ?? null });
  }

  const chave = String(body.chave ?? "");
  if (!CHAVES.has(chave)) return json({ erro: `chave nao permitida: ${chave}` }, 400);
  // valor null NAO grava: e assim que uma fonte que falhou preserva o valor
  // anterior em vez de zerar o painel. Um dado de uma hora atras e util; um zero
  // falso ("voce nao deve nada a ninguem") e pior que nao atualizar.
  if (body.valor === null || body.valor === undefined) {
    return json({ ok: true, pulou: "valor nulo -- manteve o anterior" });
  }

  const { error } = await sb.from("painel_cache").upsert(
    { chave, valor: body.valor, atualizado_em: new Date().toISOString() },
    { onConflict: "chave" });
  if (error) return json({ erro: error.message }, 500);

  const n = Array.isArray(body.valor) ? body.valor.length : null;
  return json({ ok: true, chave, itens: n });
});
