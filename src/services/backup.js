// Backup dos dados do painel: baixar, restaurar, e o retrato em memoria para o
// envio automatico (GitHub/e-mail). Toda chamada leva o cracha.

import { comCracha } from "../lib/sessao.js";

import { API } from "../lib/api.js";
import {executarBackupsSequenciais} from '../../supabase/functions/_shared/fila-backup.mjs';

const BASE = `${API}/painel-backup`;

async function chamar(action, extra = {}) {
  if (import.meta.env.MODE === "review") {
    const {simularBackup} = await import("../review/dados.mjs");
    return simularBackup(action);
  }
  const resp = await comCracha(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  const corpo = await resp.json().catch(() => null);
  if (!resp.ok) throw new Error(corpo?.erro || "Falha no backup.");
  return corpo;
}

export const exportarBackup = () => chamar("exportar").then((r) => r.backup);
export const restaurarBackup = (backup, apagarAntes = false) =>
  chamar("restaurar", { backup, apagarAntes });
export const statusBackup = () => chamar("status").then((r) => r.status);
export const registrarManual = () => chamar("registrarManual").catch(() => {});
// Cada sistema recebe uma requisição própria; uma demora não segura a rodada inteira.
export async function backupHubAgora(sistema, progresso) {
 const estado=await statusBackup();
 if(!estado?.capacidades?.individual)throw new Error('Atualize a página para consultar a versão de backup individual.');
 const chaves=sistema?[sistema]:estado.capacidades.sistemas || Object.keys(estado.sistemas || {});
 return executarBackupsSequenciais(chaves,k=>chamar('backupAgora',{sistema:k}),progresso);
}

// Baixa o backup como arquivo .json no computador do usuario.
export async function baixarBackup() {
  const backup = await exportarBackup();
  const nome = `impresilk-backup-${backup.exportadoEm.slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  registrarManual(); // marca "ultimo backup" (o download ja aconteceu)
  return { nome, tamanho: blob.size };
}

// Le um arquivo de backup escolhido pelo usuario.
export function lerArquivoBackup(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      try {
        resolve(JSON.parse(String(fr.result || "{}")));
      } catch {
        reject(new Error("Este arquivo nao e um backup valido."));
      }
    };
    fr.onerror = () => reject(new Error("Nao consegui ler o arquivo."));
    fr.readAsText(file);
  });
}
