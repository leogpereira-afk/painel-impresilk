// E-mail do backup: a 2a copia, fora do GitHub.
//
// BACKGROUND function (sufixo -background) => Netlify responde 202 na hora e deixa
// rodar ate 15 min. Fica separada do backup do hub de proposito: aquele ja roda
// perto do teto de 26s da function normal, e montar+enviar ~2 MB de anexos aqui
// nao caberia. Aqui sobra tempo.
//
// Fluxo: o backup do hub, ao terminar, chama esta funcao passando so o DIA. Ela le
// os arquivos daquele dia JA salvos no GitHub (um por sistema), monta um POST e
// manda pro webhook do n8n, que dispara o e-mail com os arquivos anexados. O n8n
// guarda a credencial de e-mail -- ela nunca fica no painel.
//
// Variaveis (Netlify):
//   N8N_BACKUP_WEBHOOK  URL do webhook do n8n (sem ela, e-mail fica desligado).
//   GITHUB_REPO/TOKEN   de onde ler os arquivos do dia.
//   TOKEN               segredo que autoriza o disparo interno (mesmo do backup).
//   SISTEMAS_BACKUP     lista dos sistemas (p/ saber quais arquivos existem).
//   BACKUP_EMAIL_PARA   (opcional) destinatario; padrao leogpereira@gmail.com.

import { getStore, connectLambda } from "@netlify/blobs";

function sistemasExternos() {
  try {
    return JSON.parse(process.env.SISTEMAS_BACKUP || "[]");
  } catch {
    return [];
  }
}

async function lerDoGithub(repo, token, caminho) {
  const r = await fetch(`https://api.github.com/repos/${repo}/contents/${caminho}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github.raw",
      "User-Agent": "impresilk-painel-backup",
    },
  });
  if (!r.ok) throw new Error(`GitHub ${r.status} em ${caminho}`);
  return r.text();
}

export const handler = async (event) => {
  try {
    connectLambda(event);
  } catch {}

  const painel = getStore("painel");
  // Grava o resultado do e-mail dentro do backup_status (a tela le de la).
  const marcar = async (email) => {
    const st = (await painel.get("backup_status", { type: "json" }).catch(() => null)) || {};
    st.email = email;
    await painel.setJSON("backup_status", st).catch(() => {});
  };

  // So o proprio servidor dispara (mesmo TOKEN do backup automatico).
  const h = event.headers || {};
  const tok = h["x-token"] || h["X-Token"];
  if (!process.env.TOKEN || tok !== process.env.TOKEN) {
    return { statusCode: 401, body: "nao autorizado" };
  }

  let corpo = {};
  try {
    corpo = JSON.parse(event.body || "{}");
  } catch {}
  const dia = corpo.dia || new Date().toISOString().slice(0, 10);
  const resumo = corpo.resumo || null;

  const webhook = process.env.N8N_BACKUP_WEBHOOK;
  const repo = process.env.GITHUB_REPO;
  const token = process.env.GITHUB_TOKEN;
  if (!webhook || !repo || !token) {
    await marcar({
      em: new Date().toISOString(),
      ok: false,
      erro: "e-mail nao configurado (falta N8N_BACKUP_WEBHOOK/GITHUB_REPO/GITHUB_TOKEN)",
    });
    return { statusCode: 200, body: "sem config" };
  }

  // Le os arquivos do dia (painel + os externos). Cada um falha sozinho.
  const chaves = ["painel", ...sistemasExternos().map((s) => s.key)];
  const arquivos = [];
  const falhas = [];
  for (const k of chaves) {
    try {
      const texto = await lerDoGithub(repo, token, `${k}/${dia}.json`);
      arquivos.push({
        nome: `${k}-${dia}.json`,
        tipo: "application/json",
        base64: Buffer.from(texto).toString("base64"),
      });
    } catch (e) {
      falhas.push(`${k}: ${e.message}`);
    }
  }

  if (arquivos.length === 0) {
    await marcar({
      em: new Date().toISOString(),
      ok: false,
      erro: `nada para enviar (${falhas.join("; ") || "sem arquivos no GitHub"})`,
    });
    return { statusCode: 200, body: "sem arquivos" };
  }

  const payload = {
    origem: "painel-impresilk",
    assunto: `Backup Impresilk — ${dia}`,
    para: process.env.BACKUP_EMAIL_PARA || "leogpereira@gmail.com",
    dia,
    resumo,
    arquivos,
  };

  try {
    const r = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const ok = r.ok;
    await marcar({
      em: new Date().toISOString(),
      ok,
      enviados: arquivos.length,
      destino: "E-mail via n8n",
      erro: ok
        ? falhas.length
          ? `enviado, mas faltaram: ${falhas.join("; ")}`
          : null
        : `n8n respondeu HTTP ${r.status}`,
    });
    return { statusCode: 200, body: ok ? "enviado" : "falha n8n" };
  } catch (e) {
    await marcar({ em: new Date().toISOString(), ok: false, enviados: 0, erro: String(e?.message || e) });
    return { statusCode: 200, body: "erro" };
  }
};
