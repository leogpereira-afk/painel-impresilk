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

// Chaves em que uma lista VAZIA quase nunca e a verdade -- e quando e, quem
// grava manda `forcarVazio: true`. Ficam de fora `status` (objeto), `lock`,
// `dso_hist` (a serie comeca vazia mesmo) e `fluxo_mensal` (projecao).
const LISTAS_QUE_NAO_ESVAZIAM = new Set(["recebiveis", "pagar", "bancos", "orcamentos", "ordens"]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erro: "use POST" }, 405);
  if (!TOKEN || req.headers.get("x-token") !== TOKEN) return json({ erro: "nao autorizado" }, 401);

  /* AS O.S. TAMBEM VIRAM LINHA, alem de entrar no vetor do cache.
     `painel_ordens` existe para a busca da tela de Permutas alcancar 2020 sem
     inchar o login: o vetor do cache viaja INTEIRO para o navegador, a tabela
     nao. Ver 20260818h_painel_ordens.sql.

     Chega em LOTES porque a carga do historico manda ~19.500 linhas: um corpo
     unico estouraria o limite de tamanho da funcao. Cada lote e um upsert por
     id -- reenviar o mesmo lote nao duplica, e uma corrida que morra no meio
     deixa o que ja subiu, sem inconsistencia.

     NAO APAGA o que nao veio. Uma carga leve traz 7 dias; se ela limpasse o
     resto, a tabela encolheria para uma semana toda vez -- e a permuta perderia
     as O.S. que ja tinha aceitado da lista de escolha. */
  if (req.method === "POST") {
    const espiar = await req.clone().json().catch(() => null);
    if (espiar && espiar.action === "ordens") {
      const linhas = Array.isArray(espiar.linhas) ? espiar.linhas : [];
      if (!linhas.length) return json({ ok: true, gravadas: 0 });
      if (linhas.length > 2000) return json({ erro: "lote grande demais (max 2000)" }, 413);
      const limpas = linhas.map((o: any) => ({
        id: String(o?.id ?? ""),
        numero: String(o?.numero ?? ""),
        cliente: String(o?.cliente ?? ""),
        cliente_chave: String(o?.clienteChave ?? ""),
        cnpj: String(o?.cnpj ?? ""),
        data: String(o?.data ?? "").slice(0, 10) || null,
        valor: Number(o?.valor) || 0,
        vendedor: String(o?.vendedor ?? ""),
        atualizado_em: new Date().toISOString(),
      })).filter((o: any) => o.id);
      const { error } = await sb.from("painel_ordens").upsert(limpas, { onConflict: "id" });
      if (error) return json({ erro: error.message }, 500);
      return json({ ok: true, gravadas: limpas.length });
    }
    /* De quando puxar o historico de O.S. A direcao escolhe na tela de
       Permutas, e quem GUARDA e o painel_config_global -- um dono so. A carga
       precisa ler, e ela nao tem a chave do banco: so este passa-fio, de
       leitura, com o mesmo token que ja a autoriza a gravar cache. */
    if (espiar && espiar.action === "cfgHistorico") {
      const { data } = await sb.from("painel_config_global")
        .select("config").eq("id", true).maybeSingle();
      const d = String((data?.config as any)?.historicoDesde ?? "");
      return json({ ok: true, historicoDesde: /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null });
    }

    /* O CANCELAMENTO TEM QUE APAGAR A LINHA. A carga descarta a O.S. cancelada
       antes de normalizar, entao ela simplesmente para de vir -- e sem isto
       ficaria na tabela para sempre, aparecendo na lista de escolha da permuta
       como se ainda existisse. */
    if (espiar && espiar.action === "ordensApagar") {
      const ids = (Array.isArray(espiar.ids) ? espiar.ids : []).map(String).filter(Boolean);
      if (!ids.length) return json({ ok: true, apagadas: 0 });
      const { error } = await sb.from("painel_ordens").delete().in("id", ids.slice(0, 2000));
      if (error) return json({ erro: error.message }, 500);
      return json({ ok: true, apagadas: ids.length });
    }
  }

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
    const { data, error } = await sb
      .from("painel_cache").select("valor").eq("chave", chaveLida).maybeSingle();
    // Erro de leitura NAO pode virar "nao tem nada gravado". Engolir o `error`
    // fazia a carga incremental receber null, tratar como base vazia e regravar
    // `ordens` so com a janela de 7 dias -- um soluco do banco apagava o ano
    // inteiro de O.S., e o status ainda saia ok:true. 500 faz o script abortar
    // e o cache ficar como estava.
    if (error) return json({ erro: `falha ao ler ${chaveLida}: ${error.message}` }, 500);
    // "status" volta com o nome antigo para nao quebrar quem ja chama assim.
    // `existe` distingue "chave nunca gravada" de "gravada com lista vazia" --
    // a carga precisa dos dois separados para saber se pode mesclar.
    return chaveLida === "status"
      ? json({ status: data?.valor ?? null, existe: !!data })
      : json({ chave: chaveLida, valor: data?.valor ?? null, existe: !!data });
  }

  const chave = String(body.chave ?? "");
  if (!CHAVES.has(chave)) return json({ erro: `chave nao permitida: ${chave}` }, 400);
  // valor null NAO grava: e assim que uma fonte que falhou preserva o valor
  // anterior em vez de zerar o painel. Um dado de uma hora atras e util; um zero
  // falso ("voce nao deve nada a ninguem") e pior que nao atualizar.
  if (body.valor === null || body.valor === undefined) {
    return json({ ok: true, pulou: "valor nulo -- manteve o anterior" });
  }

  // Mesma ideia, um degrau acima: LISTA VAZIA por cima de lista cheia tambem e
  // quase sempre falha disfarcada de sucesso -- um 404 intermitente do ERP, uma
  // consulta que voltou sem itens. A trava do `null` nao pegava isso, porque []
  // e um valor legitimo. Recusa e devolve `pulou`, para o chamador registrar em
  // fontesQueFalharam em vez de comemorar.
  //
  // `forcarVazio: true` continua permitindo zerar de proposito (o dia em que
  // nao ha mesmo nenhum titulo). Sem essa saida, a trava viraria um bug novo em
  // 1o de janeiro, quando `ordens` legitimamente comeca vazia.
  if (LISTAS_QUE_NAO_ESVAZIAM.has(chave) && Array.isArray(body.valor) && body.valor.length === 0
      && body.forcarVazio !== true) {
    const { data: atual } = await sb
      .from("painel_cache").select("valor").eq("chave", chave).maybeSingle();
    const tinha = Array.isArray(atual?.valor) ? atual.valor.length : 0;
    if (tinha > 0) {
      return json({
        ok: true,
        pulou: `lista vazia por cima de ${tinha} itens -- manteve o anterior`,
        recusouVazio: true,
      });
    }
  }

  const { error } = await sb.from("painel_cache").upsert(
    { chave, valor: body.valor, atualizado_em: new Date().toISOString() },
    { onConflict: "chave" });
  if (error) return json({ erro: error.message }, 500);

  const n = Array.isArray(body.valor) ? body.valor.length : null;
  return json({ ok: true, chave, itens: n });
});
