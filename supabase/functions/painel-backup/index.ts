// ============================================================================
// painel-backup — backup do Hub inteiro (substitui backup.js)
//
// O painel e a capa, entao e ele quem orquestra: guarda o proprio dado E PUXA
// os outros sistemas pelos endpoints que eles ja tem ({action:"list"} paginado
// + getCfg). Registry em SISTEMAS_BACKUP (secret, JSON):
//   [{key,nome,url,fn,listKey,token}]
// Na transicao o secret aponta para os endpoints NOVOS (Edge Functions); o
// painel antigo no Netlify segue fazendo o backup dele em paralelo — dois
// backups por dia nao machucam ninguem.
//
// Destino: repositorio privado no GitHub (GITHUB_REPO), uma pasta por sistema,
// um arquivo por dia (versionado). GITHUB_TOKEN e um PAT restrito a esse repo.
//
// DISPARO: pg_cron diario chama {action:"auto"} com o x-token. No Netlify o
// gatilho era piggyback no login, porque o cron de la ja congelou 11 horas; o
// pg_cron daqui tem execucao comprovada, entao o agendamento volta a ser o
// caminho normal. A trava de 20h continua: rodar duas vezes no dia nao repete.
//
// Acoes: status (qualquer sessao) | auto (x-token, gate 20h) |
//        exportar / registrarManual / backupAgora / restaurar (so a direcao).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { verificarJwt } from "../_shared/cripto.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET") ?? "";
const TOKEN = Deno.env.get("PAINEL_TOKEN") ?? "";
const GH_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const GH_REPO = Deno.env.get("GITHUB_REPO") ?? "";
const VERSAO = 2; // v2: formato do Supabase (colecoes em vez de chaves de blob)

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const resposta = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

// ---------------------------------------------------------------- leitura local

async function linhasDe(colecao: string): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const PASSO = 1000;
  for (let de = 0; ; de += PASSO) {
    const { data, error } = await sb.from("painel_registros").select("id, registro")
      .eq("colecao", colecao).order("id").range(de, de + PASSO - 1);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) out[r.id] = r.registro;
    if ((data ?? []).length < PASSO) break;
  }
  return out;
}

async function montarBackupPainel() {
  const { data: cfg } = await sb.from("painel_config_global").select("config").eq("id", true).maybeSingle();
  const { data: contasRaw, error } = await sb.from("painel_contas").select("*");
  if (error) throw new Error(error.message);
  const contas: Record<string, unknown> = {};
  for (const c of contasRaw ?? []) {
    // COM hash/salt de proposito: e o que permite restaurar sem todo mundo
    // recriar senha. O repositorio do backup e privado.
    contas[c.usuario] = {
      usuario: c.usuario, nome: c.nome, permissoes: c.permissoes,
      vendedorId: c.vendedor_id, hash: c.hash, salt: c.salt, iter: c.iter,
      atualizadoEm: c.atualizado_em,
    };
  }
  return {
    versao: VERSAO,
    sistema: "painel",
    exportadoEm: new Date().toISOString(),
    painel: {
      config: cfg?.config ?? null,
      ov_rec: await linhasDe("ov_rec"),
      ov_orc: await linhasDe("ov_orc"),
      ativos: await linhasDe("ativo"),
      arquivosMeta: await linhasDe("arquivo"),
      marketing: await linhasDe("marketing"),
      bancos: await linhasDe("bancos"),
      glossario: await linhasDe("glossario"),
      // Os BYTES dos arquivos ficam no bucket (duraveis); um backup diario
      // deles incharia o repositorio. Mesma decisao do original com as fotos.
    },
    contas,
  };
}

// ---------------------------------------------------------------- sistemas externos

function sistemasExternos(): any[] {
  // Duas fontes, somadas. SISTEMAS_BACKUP é o registry histórico (um JSON com
  // TODOS os sistemas e seus tokens); SISTEMAS_BACKUP_EXTRA existe para
  // ACRESCENTAR um sistema novo sem reescrever aquele blob.
  //
  // Por que isso importa: a Management API devolve o valor dos secrets
  // MASCARADO. Para incluir o Compras (03/08/2026) seria preciso reescrever o
  // registry inteiro de memória — e um token digitado errado derrubaria em
  // silêncio o backup de outro sistema. Somar é aditivo e reversível: apagar o
  // EXTRA volta ao estado anterior sem tocar no que já funciona.
  const ler = (nome: string): any[] => {
    try {
      const v = JSON.parse(Deno.env.get(nome) ?? "[]");
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  };
  const base = ler("SISTEMAS_BACKUP");
  // Generalização (03/08/2026, entrada do Pops): TODO secret cujo nome começa
  // com SISTEMAS_BACKUP_ soma ao registry — cada sistema novo ganha o seu
  // (SISTEMAS_BACKUP_EXTRA, SISTEMAS_BACKUP_POPS, ...) sem reescrever nem
  // arriscar o token de ninguém. Ordem alfabética para o "quem manda" ser
  // determinístico; chave repetida: o último (mais específico) vence.
  const extras = Object.keys(Deno.env.toObject())
    .filter((n) => n.startsWith("SISTEMAS_BACKUP_"))
    .sort()
    .flatMap((n) => ler(n));
  const porChave = new Map<string, any>();
  for (const s of [...base, ...extras]) if (s && s.key) porChave.set(s.key, s);
  return [...porChave.values()];
}

async function chamarSistema(sys: any, body: unknown) {
  // url completa no registry (as Edge Functions nao tem o caminho
  // /.netlify/functions/, entao o registry traz o endpoint inteiro em `url`
  // quando `fn` estiver vazio).
  const alvo = sys.fn ? `${sys.url}/.netlify/functions/${sys.fn}` : sys.url;
  const r = await fetch(alvo, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-token": sys.token },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${sys.key}: HTTP ${r.status}`);
  return r.json();
}

async function puxarSistema(sys: any) {
  const registros: unknown[] = [];
  let after: unknown = null;
  for (let guarda = 0; guarda < 300; guarda++) {
    const res = await chamarSistema(sys, after != null ? { action: "list", after } : { action: "list" });
    registros.push(...(res[sys.listKey] || res.registros || res.os || res.itens || []));
    after = res.nextAfter ?? null;
    if (after == null) break;
  }
  let cfg = null;
  try {
    cfg = (await chamarSistema(sys, { action: "getCfg" })).cfg ?? null;
  } catch { /* nem todo sistema tem getCfg */ }
  return {
    versao: VERSAO, sistema: sys.key, nome: sys.nome,
    exportadoEm: new Date().toISOString(), registros, cfg,
    fotos: "nao incluidas neste backup",
  };
}

// ---------------------------------------------------------------- github

async function enviarParaGithub(chaveSistema: string, backup: any) {
  if (!GH_TOKEN || !GH_REPO) return { ok: false, motivo: "GitHub nao configurado (falta GITHUB_TOKEN/GITHUB_REPO)" };
  const dia = backup.exportadoEm.slice(0, 10);
  const caminho = `${chaveSistema}/${dia}.json`;
  // base64 em BLOCOS: espalhar um array grande em String.fromCharCode(...)
  // estoura a pilha -- e um backup de sistema (RH ~900 KB) e grande.
  const bytes = new TextEncoder().encode(JSON.stringify(backup));
  let bin = "";
  const BLOCO = 0x8000;
  for (let i = 0; i < bytes.length; i += BLOCO) {
    bin += String.fromCharCode(...bytes.subarray(i, i + BLOCO));
  }
  const conteudo = btoa(bin);
  const url = `https://api.github.com/repos/${GH_REPO}/contents/${caminho}`;
  const cab = {
    Authorization: `Bearer ${GH_TOKEN}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "impresilk-painel-backup",
  };
  let sha: string | undefined;
  try {
    const r = await fetch(url, { headers: cab });
    if (r.ok) sha = (await r.json()).sha;
  } catch { /* arquivo novo */ }
  const r = await fetch(url, {
    method: "PUT",
    headers: cab,
    body: JSON.stringify({
      message: `backup ${chaveSistema} ${backup.exportadoEm}`,
      content: conteudo,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return { ok: false, motivo: `GitHub ${r.status}: ${t.slice(0, 100)}` };
  }
  return { ok: true, caminho };
}

// ---------------------------------------------------------------- hub

async function lerStatus() {
  const { data } = await sb.from("painel_meta").select("valor").eq("chave", "backup_status").maybeSingle();
  return data?.valor ?? null;
}
async function gravarStatus(st: unknown) {
  // try/await, e nao .catch(): o query builder do supabase-js e "thenable" mas
  // NAO tem .catch proprio -- chamar .catch nele lanca TypeError e derruba o
  // backup INTEIRO depois de ele ja ter rodado (erro real, pago aqui).
  try {
    await sb.from("painel_meta").upsert(
      { chave: "backup_status", valor: st, atualizado_em: new Date().toISOString() },
      { onConflict: "chave" });
  } catch { /* status e best-effort */ }
}

async function backupDoHub() {
  const porSistema: Record<string, unknown> = {};
  const agora = new Date().toISOString();

  // 1) o proprio painel. Cada sistema falha sozinho.
  try {
    const bkp = await montarBackupPainel();
    const gh = await enviarParaGithub("painel", bkp);
    porSistema.painel = {
      em: agora, ok: gh.ok,
      registros: Object.keys(bkp.painel.ov_rec).length + Object.keys(bkp.painel.ov_orc).length +
        Object.keys(bkp.painel.ativos).length + Object.keys(bkp.contas).length +
        (bkp.painel.config ? 1 : 0),
      erro: gh.ok ? null : (gh as any).motivo,
    };
  } catch (e) {
    porSistema.painel = { em: agora, ok: false, erro: (e as Error)?.message ?? String(e) };
  }

  // 2) os outros, puxados por HTTP.
  for (const sys of sistemasExternos()) {
    try {
      const bkp = await puxarSistema(sys);
      const gh = await enviarParaGithub(sys.key, bkp);
      porSistema[sys.key] = {
        nome: sys.nome, em: agora, ok: gh.ok,
        registros: bkp.registros.length,
        erro: gh.ok ? null : (gh as any).motivo,
      };
    } catch (e) {
      porSistema[sys.key] = { nome: sys.nome, em: agora, ok: false, erro: (e as Error)?.message ?? String(e) };
    }
  }

  await gravarStatus({ atualizadoEm: agora, sistemas: porSistema });
  return porSistema;
}

// ---------------------------------------------------------------- handler

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return resposta({ erro: "use POST" }, 405);

  let corpo: any = {};
  try {
    corpo = await req.json();
  } catch {
    return resposta({ erro: "json invalido" }, 400);
  }

  // status: leitura leve (data/hora e ok por sistema, nenhum dado).
  if (corpo.action === "status") {
    return resposta({ ok: true, status: await lerStatus() });
  }

  // sistemas: diagnostico read-only -- QUAIS sistemas este backup enxerga hoje.
  // Existe porque a Management API devolve os secrets MASCARADOS: sem isto, a
  // unica forma de saber se um sistema novo entrou no registry era esperar a
  // rodada da noite e ver se a pasta apareceu. Nao devolve token nenhum.
  if (corpo.action === "sistemas") {
    if (!TOKEN || req.headers.get("x-token") !== TOKEN) return resposta({ erro: "nao autorizado" }, 401);
    const vistos = sistemasExternos().map((s: any) => ({
      key: s.key, nome: s.nome ?? null, listKey: s.listKey ?? null,
      url: s.fn ? `${s.url}/.netlify/functions/${s.fn}` : s.url,
      temToken: !!s.token,
    }));
    return resposta({ ok: true, quantos: vistos.length, sistemas: vistos });
  }

  // auto: disparo interno (pg_cron) com o token do servidor, gateado por 20h.
  if (corpo.action === "auto") {
    if (!TOKEN || req.headers.get("x-token") !== TOKEN) return resposta({ erro: "nao autorizado" }, 401);
    const st: any = await lerStatus();
    const horas = st?.atualizadoEm ? (Date.now() - new Date(st.atualizadoEm).getTime()) / 3600000 : Infinity;
    if (horas < 20) return resposta({ ok: true, pulou: "backup recente" });
    return resposta({ ok: true, sistemas: await backupDoHub() });
  }

  // Daqui para baixo, so a direcao.
  if (!JWT_SECRET) return resposta({ erro: "Login nao configurado." }, 503);
  const m = String(req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  const s = m ? await verificarJwt(m[1], JWT_SECRET) : null;
  if (!s) return resposta({ erro: "Entre no sistema." }, 401);
  if (s.master !== true) return resposta({ erro: "Apenas a direcao pode fazer backup." }, 403);

  try {
    switch (corpo.action) {
      case "exportar":
        return resposta({ ok: true, backup: await montarBackupPainel() });

      case "registrarManual": {
        const st: any = (await lerStatus()) ?? { sistemas: {} };
        st.atualizadoEm = new Date().toISOString();
        st.sistemas = st.sistemas ?? {};
        st.sistemas.painel = { em: st.atualizadoEm, ok: true, destino: "Baixado no computador" };
        await gravarStatus(st);
        return resposta({ ok: true });
      }

      case "backupAgora":
        return resposta({ ok: true, sistemas: await backupDoHub() });

      case "restaurar": {
        const bk = corpo.backup;
        if (!bk || bk.sistema !== "painel") {
          return resposta({ erro: "Arquivo de backup invalido (so restauro o painel por aqui)." }, 400);
        }
        let gravou = 0;

        // v2 (formato do Supabase) e v1 (formato do Blobs) sao aceitos: o
        // backup de ontem nao vira lixo por causa da migracao.
        const p = bk.painel ?? {};
        const cfg = p.config ?? (bk.versao === 1 ? p.config : null);
        if (cfg) {
          await sb.from("painel_config_global").upsert(
            { id: true, config: cfg, atualizado_em: new Date().toISOString() }, { onConflict: "id" });
          gravou++;
        }
        const mapas: Array<[string, Record<string, unknown>]> = [];
        if (bk.versao >= 2) {
          mapas.push(["ov_rec", p.ov_rec ?? {}], ["ov_orc", p.ov_orc ?? {}],
                     ["ativo", p.ativos ?? {}], ["arquivo", p.arquivosMeta ?? {}]);
          // Backups de antes destas abas nao tem as chaves; nada a restaurar.
          if (p.marketing) mapas.push(["marketing", p.marketing]);
          if (p.bancos) mapas.push(["bancos", p.bancos]);
          if (p.glossario) mapas.push(["glossario", p.glossario]);
        } else {
          // v1: chaves de blob (ov_rec/ov_orc mapas; ativo_<id> soltos)
          mapas.push(["ov_rec", p.ov_rec ?? {}], ["ov_orc", p.ov_orc ?? {}]);
          const ativos: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(p)) {
            if (k.startsWith("ativo_") && v) ativos[k.slice(6)] = v;
          }
          mapas.push(["ativo", ativos]);
        }
        for (const [colecao, mapa] of mapas) {
          for (const [id, registro] of Object.entries(mapa)) {
            if (registro == null) continue;
            await sb.from("painel_registros").upsert(
              { colecao, id, registro, atualizado_em: new Date().toISOString() },
              { onConflict: "colecao,id" });
            gravou++;
          }
        }
        let contas = 0;
        for (const [u, c] of Object.entries(bk.contas ?? {}) as [string, any][]) {
          if (!c?.hash) continue;
          await sb.from("painel_contas").upsert({
            usuario: c.usuario ?? u, nome: c.nome ?? u,
            permissoes: c.permissoes ?? [], vendedor_id: c.vendedorId ?? "",
            hash: c.hash, salt: c.salt, iter: c.iter ?? 120000,
            atualizado_em: new Date().toISOString(),
          }, { onConflict: "usuario" });
          contas++;
        }
        return resposta({ ok: true, gravou, contas });
      }

      default:
        return resposta({ erro: "acao desconhecida" }, 400);
    }
  } catch (e) {
    console.error("[painel-backup] erro:", e);
    return resposta({ erro: "erro interno no backup" }, 500);
  }
});
