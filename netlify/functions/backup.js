// Backup e restauracao dos DADOS de TODOS os sistemas da Impresilk.
//
// O painel e a capa, entao e ele quem orquestra o backup do Hub inteiro. Ele
// guarda o proprio dado E PUXA os outros sistemas pelos endpoints que eles ja
// tem (acao "list" + "getCfg"), sem tocar no codigo de nenhum deles -- decidido
// no reconhecimento de 2026-07-27: os quatro (PCP, Brief, RH, DRE) expoem "list".
//
// O que entra: o que NAO volta se o site sumir.
//   painel: config, marcacoes (ov_*), documentos+arquivos (ativo_/arquivo_),
//           contas (painel-auth, com hash).
//   outros: os registros estruturados de cada um + a config.
// NAO entra: cache_* do painel (copia do Mubisys, se reconstroi) e as FOTOS dos
// sistemas de campo (binarios grandes; ficam nos Blobs deles, que sao duraveis
// -- um backup diario de fotos incharia o repositorio). Fotos = tarefa a parte.
//
// So a DIRECAO (master) exporta/restaura pela tela. O disparo automatico (login)
// usa o TOKEN do servidor. Destino: repositorio privado no GitHub, uma pasta por
// sistema, um arquivo por dia (versionado).

import { getStore, connectLambda } from "@netlify/blobs";
import { verificarJwt } from "../lib/cripto.mjs";

const VERSAO = 1;
const resposta = (body, status = 200) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

async function exigirMaster(event) {
  const secret = process.env.JWT_SECRET;
  if (!secret) return { erro: resposta({ erro: "Login nao configurado." }, 503) };
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || "";
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  const s = m ? await verificarJwt(m[1], secret) : null;
  if (!s) return { erro: resposta({ erro: "Entre no sistema." }, 401) };
  if (s.master !== true) return { erro: resposta({ erro: "Apenas a direcao pode fazer backup." }, 403) };
  return { sessao: s };
}

// Chaves de dados a preservar do store "painel" (o resto e cache descartavel).
const ehChaveDeDados = (k) =>
  k === "config" ||
  k === "ov_rec" ||
  k === "ov_orc" ||
  k.startsWith("ativo_") ||
  k.startsWith("arquivo_");

async function listarChaves(store, filtro) {
  const out = [];
  let cursor;
  let guarda = 0;
  do {
    const page = await store.list(cursor ? { cursor } : undefined);
    for (const b of page?.blobs || []) if (!filtro || filtro(b.key)) out.push(b.key);
    cursor = page?.cursor;
  } while (cursor && ++guarda < 5000);
  return out;
}

// ------- backup do PROPRIO painel -------
async function montarBackupPainel(painel, auth) {
  const chaves = await listarChaves(painel, ehChaveDeDados);
  const dados = {};
  await Promise.all(
    chaves.map(async (k) => {
      dados[k] = await painel.get(k, { type: "json" }).catch(() => null);
    })
  );
  const contasChaves = await listarChaves(auth);
  const contas = {};
  await Promise.all(
    contasChaves.map(async (k) => {
      contas[k] = await auth.get(k, { type: "json" }).catch(() => null);
    })
  );
  return { versao: VERSAO, sistema: "painel", exportadoEm: new Date().toISOString(), painel: dados, contas };
}

// ------- puxa um sistema externo pelos endpoints que ele ja tem -------
// Registry em SISTEMAS_BACKUP (env, JSON): [{key,nome,url,fn,listKey,token}].
function sistemasExternos() {
  try {
    return JSON.parse(process.env.SISTEMAS_BACKUP || "[]");
  } catch {
    return [];
  }
}

async function chamarSistema(sys, body) {
  const r = await fetch(`${sys.url}/.netlify/functions/${sys.fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-token": sys.token },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${sys.key}: HTTP ${r.status}`);
  return r.json();
}

async function puxarSistema(sys) {
  // Registros estruturados: "list" paginado por chave (after/nextAfter).
  const registros = [];
  let after = null;
  let guarda = 0;
  do {
    const res = await chamarSistema(sys, after != null ? { action: "list", after } : { action: "list" });
    const lote = res[sys.listKey] || res.registros || res.os || res.itens || [];
    registros.push(...lote);
    after = res.nextAfter ?? null;
  } while (after != null && ++guarda < 300);

  // Config (best-effort; nem todo sistema tem).
  let cfg = null;
  try {
    cfg = (await chamarSistema(sys, { action: "getCfg" })).cfg ?? null;
  } catch {}

  return {
    versao: VERSAO,
    sistema: sys.key,
    nome: sys.nome,
    exportadoEm: new Date().toISOString(),
    registros,
    cfg,
    // Fotos NAO entram no backup diario (binarios grandes). Ficam nos Blobs do
    // sistema; um export dedicado e tarefa a parte.
    fotos: "nao incluidas neste backup",
  };
}

// ------- GitHub: um arquivo por dia, por sistema -------
async function enviarParaGithub(chaveSistema, backup) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) return { ok: false, motivo: "GitHub nao configurado (falta GITHUB_TOKEN/GITHUB_REPO)" };

  const dia = backup.exportadoEm.slice(0, 10);
  const caminho = `${chaveSistema}/${dia}.json`;
  const conteudo = Buffer.from(JSON.stringify(backup)).toString("base64");
  const url = `https://api.github.com/repos/${repo}/contents/${caminho}`;
  const cab = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "impresilk-painel-backup",
  };
  let sha;
  try {
    const r = await fetch(url, { headers: cab });
    if (r.ok) sha = (await r.json()).sha;
  } catch {}

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

// ------- e-mail do backup (2a copia, fora do GitHub) -------
// Dispara uma BACKGROUND function (ate 15 min), passando so o dia. Ela le os
// arquivos ja salvos no GitHub e faz o POST no webhook do n8n, que manda o e-mail
// com os anexos. Fica separada de proposito: o backup do hub ja roda perto do teto
// de 26s da function normal, e montar+enviar ~2 MB de anexo aqui estouraria o
// tempo. Se N8N_BACKUP_WEBHOOK nao existe, e-mail esta desligado e isto e no-op.
async function dispararEmailBackup(dia, resumo) {
  if (!process.env.N8N_BACKUP_WEBHOOK) return;
  try {
    const base = process.env.URL || "https://impresilk.netlify.app";
    // Background function responde 202 na hora; o await custa ~nada e garante que
    // a invocacao foi enfileirada antes de esta function congelar.
    await fetch(`${base}/.netlify/functions/backup-email-background`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-token": process.env.TOKEN || "" },
      body: JSON.stringify({ dia, resumo }),
    });
  } catch {
    /* e-mail e secundario: nunca derruba o backup */
  }
}

// ------- backup do HUB INTEIRO -------
// Cada sistema falha sozinho (um fora do ar nao derruba os outros). Devolve o
// resultado por sistema, que vira o "ultimo backup" mostrado na tela.
async function backupDoHub(painel, auth) {
  const porSistema = {};
  const agora = new Date().toISOString();

  // 1) painel (dado local).
  try {
    const bkp = await montarBackupPainel(painel, auth);
    const gh = await enviarParaGithub("painel", bkp);
    porSistema.painel = {
      em: agora,
      ok: gh.ok,
      registros: Object.keys(bkp.painel).length + Object.keys(bkp.contas).length,
      erro: gh.ok ? null : gh.motivo,
    };
  } catch (e) {
    porSistema.painel = { em: agora, ok: false, erro: String(e?.message || e) };
  }

  // 2) os outros, puxados por HTTP.
  for (const sys of sistemasExternos()) {
    try {
      const bkp = await puxarSistema(sys);
      const gh = await enviarParaGithub(sys.key, bkp);
      porSistema[sys.key] = {
        nome: sys.nome,
        em: agora,
        ok: gh.ok,
        registros: bkp.registros.length,
        erro: gh.ok ? null : gh.motivo,
      };
    } catch (e) {
      porSistema[sys.key] = { nome: sys.nome, em: agora, ok: false, erro: String(e?.message || e) };
    }
  }

  await painel.setJSON("backup_status", { atualizadoEm: agora, sistemas: porSistema }).catch(() => {});
  // 2a copia por e-mail (se configurado). A background function le do GitHub e
  // manda pro n8n -- por isso disparamos DEPOIS de gravar no GitHub.
  await dispararEmailBackup(agora.slice(0, 10), porSistema);
  return porSistema;
}

export const handler = async (event) => {
  try {
    connectLambda(event);
  } catch {}
  if (event.httpMethod !== "POST") return resposta({ erro: "use POST" }, 405);

  const painel = getStore("painel");
  const auth = getStore("painel-auth");

  let corpo = {};
  try {
    corpo = JSON.parse(event.body || "{}");
  } catch {
    return resposta({ erro: "json invalido" }, 400);
  }

  // status: leitura leve (so data/hora e ok por sistema, nenhum dado).
  if (corpo.action === "status") {
    const st = await painel.get("backup_status", { type: "json" }).catch(() => null);
    return resposta({ ok: true, status: st });
  }

  // auto: disparo interno (login/cron) com o TOKEN do servidor. Gateado por
  // tempo -- so roda se o ultimo backup passou de 20h.
  if (corpo.action === "auto") {
    if (!process.env.TOKEN || (event.headers["x-token"] || event.headers["X-Token"]) !== process.env.TOKEN) {
      return resposta({ erro: "nao autorizado" }, 401);
    }
    const st = await painel.get("backup_status", { type: "json" }).catch(() => null);
    const horas = st?.atualizadoEm ? (Date.now() - new Date(st.atualizadoEm).getTime()) / 3600000 : Infinity;
    if (horas < 20) return resposta({ ok: true, pulou: "backup recente" });
    const r = await backupDoHub(painel, auth);
    return resposta({ ok: true, sistemas: r });
  }

  // Daqui para baixo exige a direcao.
  const g = await exigirMaster(event);
  if (g.erro) return g.erro;

  try {
    switch (corpo.action) {
      // Baixar so o painel (arquivo local imediato).
      case "exportar":
        return resposta({ ok: true, backup: await montarBackupPainel(painel, auth) });

      case "registrarManual": {
        const st = (await painel.get("backup_status", { type: "json" }).catch(() => null)) || { sistemas: {} };
        st.atualizadoEm = new Date().toISOString();
        st.sistemas = st.sistemas || {};
        st.sistemas.painel = { em: st.atualizadoEm, ok: true, destino: "Baixado no computador" };
        await painel.setJSON("backup_status", st);
        return resposta({ ok: true });
      }

      // Rodar o backup do HUB inteiro agora (painel + os 4 sistemas -> GitHub).
      case "backupAgora": {
        const r = await backupDoHub(painel, auth);
        return resposta({ ok: true, sistemas: r });
      }

      case "restaurar": {
        const bk = corpo.backup;
        if (!bk || bk.sistema !== "painel" || !bk.painel) {
          return resposta({ erro: "Arquivo de backup invalido (so restauro o painel por aqui)." }, 400);
        }
        if (corpo.apagarAntes) {
          const atuais = await listarChaves(painel, ehChaveDeDados);
          await Promise.all(atuais.map((k) => painel.delete(k).catch(() => {})));
        }
        let gravou = 0;
        for (const [k, v] of Object.entries(bk.painel)) {
          if (!ehChaveDeDados(k) || v == null) continue;
          await painel.setJSON(k, v);
          gravou++;
        }
        let contas = 0;
        for (const [k, v] of Object.entries(bk.contas || {})) {
          if (v == null) continue;
          await auth.setJSON(k, v);
          contas++;
        }
        return resposta({ ok: true, gravou, contas });
      }

      default:
        return resposta({ erro: "acao desconhecida" }, 400);
    }
  } catch (e) {
    console.error("backup:", e?.message || e);
    return resposta({ erro: "erro interno no backup" }, 500);
  }
};
