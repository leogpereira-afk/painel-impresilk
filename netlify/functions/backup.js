// Backup e restauracao dos DADOS do painel.
//
// Faz um retrato do que e insubstituivel -- o que nao volta se o site sumir:
//   config          regras do painel
//   ov_rec / ov_orc  suas marcacoes (motivo, cobrado, baixa)
//   ativo_* / arquivo_*  documentos, veiculos, maquinas E os PDFs anexados
//   contas (store painel-auth)  usuarios, permissoes e o hash da senha
//
// NAO inclui cache_* de proposito: sao copia do Mubisys e se reconstroem
// sozinhos. Um backup deve guardar o que nao se refaz, nao inchar com o que se
// refaz sozinho.
//
// So a DIRECAO (master) exporta ou restaura -- o backup carrega o hash das
// senhas de todos e as marcacoes financeiras. Nao e dado para circular.

import { getStore, connectLambda } from "@netlify/blobs";
import { verificarJwt } from "../lib/cripto.mjs";

const VERSAO = 1;
const resposta = (body, status = 200) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  body: JSON.stringify(body),
});

// So o master passa. (guarda.js exige sessao; aqui exigimos master.)
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

// Monta o retrato completo dos dados (reusado por exportar e enviarGithub).
async function montarBackup(painel, auth) {
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
  return {
    versao: VERSAO,
    sistema: "painel",
    exportadoEm: new Date().toISOString(),
    painel: dados,
    contas,
  };
}

// Registra o ultimo backup para o painel poder exibir "salvo em ... as ...".
async function registrar(painel, destino, detalhe) {
  await painel
    .setJSON("backup_status", { em: new Date().toISOString(), destino, detalhe: detalhe || "" })
    .catch(() => {});
}

// Grava o backup num repositorio GitHub (um arquivo por dia, versionado).
// Precisa de GITHUB_TOKEN (fine-grained, permissao Contents) e GITHUB_REPO
// ("dono/repositorio") nas variaveis do Netlify.
async function enviarParaGithub(backup) {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO; // ex: "leogpereira-afk/backups-impresilk"
  if (!token || !repo) return { ok: false, motivo: "GitHub nao configurado (falta GITHUB_TOKEN/GITHUB_REPO)" };

  const dia = backup.exportadoEm.slice(0, 10);
  const caminho = `painel/${dia}.json`;
  const conteudo = Buffer.from(JSON.stringify(backup)).toString("base64");
  const url = `https://api.github.com/repos/${repo}/contents/${caminho}`;
  const cab = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "impresilk-painel-backup",
  };
  // Se ja existe um arquivo desse dia, precisa do sha para sobrescrever.
  let sha;
  try {
    const r = await fetch(url, { headers: cab });
    if (r.ok) sha = (await r.json()).sha;
  } catch {}

  const r = await fetch(url, {
    method: "PUT",
    headers: cab,
    body: JSON.stringify({
      message: `backup painel ${backup.exportadoEm}`,
      content: conteudo,
      ...(sha ? { sha } : {}),
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    return { ok: false, motivo: `GitHub respondeu ${r.status}: ${t.slice(0, 120)}` };
  }
  return { ok: true, caminho, repo };
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

  // "status" e leitura leve: qualquer sessao pode ver quando foi o ultimo
  // backup (nao expoe dado nenhum, so a data/hora e o destino).
  if (corpo.action === "status") {
    const st = await painel.get("backup_status", { type: "json" }).catch(() => null);
    return resposta({ ok: true, status: st });
  }

  // "auto": disparo interno (on-use ou cron) com o TOKEN do servidor. Faz o
  // envio para o GitHub sem exigir a sessao master -- e o sistema salvando a si.
  if (corpo.action === "auto") {
    if (!process.env.TOKEN || (event.headers["x-token"] || event.headers["X-Token"]) !== process.env.TOKEN) {
      return resposta({ erro: "nao autorizado" }, 401);
    }
    const st = await painel.get("backup_status", { type: "json" }).catch(() => null);
    const horas = st?.em ? (Date.now() - new Date(st.em).getTime()) / 3600000 : Infinity;
    if (horas < 20) return resposta({ ok: true, pulou: "backup recente" });
    const backup = await montarBackup(painel, auth);
    const gh = await enviarParaGithub(backup);
    if (gh.ok) await registrar(painel, "GitHub", `${gh.repo} / ${gh.caminho}`);
    return resposta({ ok: gh.ok, github: gh });
  }

  const g = await exigirMaster(event);
  if (g.erro) return g.erro;

  try {
    switch (corpo.action) {
      // ---------------- exportar: monta o retrato completo ----------------
      case "exportar": {
        return resposta({ ok: true, backup: await montarBackup(painel, auth) });
      }

      // ---------------- registrarManual: apos o download no navegador -------
      case "registrarManual": {
        await registrar(painel, "Baixado no computador", "arquivo .json guardado pelo usuario");
        return resposta({ ok: true });
      }

      // ---------------- enviarGithub: forcar o envio agora -----------------
      case "enviarGithub": {
        const backup = await montarBackup(painel, auth);
        const gh = await enviarParaGithub(backup);
        if (gh.ok) await registrar(painel, "GitHub", `${gh.repo} / ${gh.caminho}`);
        return resposta({ ok: gh.ok, github: gh });
      }

      // ---------------- restaurar: grava tudo de volta ----------------
      // MERGE por padrao (nao apaga o que existe hoje e nao esta no backup).
      // Com apagarAntes=true, limpa as chaves de dados antes -- volta exatamente
      // ao estado do backup.
      case "restaurar": {
        const bk = corpo.backup;
        if (!bk || bk.sistema !== "painel" || !bk.painel) {
          return resposta({ erro: "Arquivo de backup invalido." }, 400);
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
